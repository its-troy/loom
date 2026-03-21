import os
import requests
from datetime import date, datetime, timedelta
from flask import Flask, render_template, redirect, request, session, url_for, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv("SUPABASE_KEY")

API_KEY      = os.getenv("API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─────────────────────────────────────────────────────────────
#  Helper — get logged-in user_id or return a 401 tuple
# ─────────────────────────────────────────────────────────────
def get_user_id():
    """Returns (user_id, None) on success or (None, error_response) on failure."""
    uid = session.get("user_id")
    if not uid:
        return None, (jsonify({"error": "Not logged in"}), 401)
    return uid, None


# ─────────────────────────────────────────────────────────────
#  Streak helper — called internally on login and check-in
# ─────────────────────────────────────────────────────────────
def _do_streak_checkin(uid):
    """
    Increments streak if it has been exactly 1 day since last_active_date.
    Resets to 1 if more than 1 day has passed (missed days).
    Safe to call multiple times per day — only acts on day boundaries.
    Reads/writes: profiles table.
    """
    today = date.today()

    user_res = (
        supabase.table("profiles")
        .select("streak_current, streak_best, last_active_date, xp_today")
        .eq("id", uid)
        .single()
        .execute()
    )
    u = user_res.data
    if not u:
        return

    last_active = u.get("last_active_date")
    streak      = u.get("streak_current", 0) or 0
    best        = u.get("streak_best", 0) or 0
    updates     = {}

    if last_active:
        last_date  = datetime.fromisoformat(str(last_active)).date()
        days_since = (today - last_date).days

        if days_since == 0:
            return  # Already checked in today — do nothing
        elif days_since == 1:
            streak += 1   # Consecutive day — extend streak
        else:
            streak = 1    # Missed one or more days — restart
            updates["xp_today"] = 0  # Reset daily XP on streak break
    else:
        streak = 1  # First ever login

    best = max(best, streak)
    updates.update({
        "streak_current":   streak,
        "streak_best":      best,
        "last_active_date": today.isoformat(),
    })
    supabase.table("profiles").update(updates).eq("id", uid).execute()


# ─────────────────────────────────────────────────────────────
#  Page routes (unchanged from your original)
# ─────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template("index.html")


@app.route('/dashboard')
def dashboard():
    user_id = session.get("user_id")
    if not user_id:
        return redirect(url_for('index'))

    try:
        response = (
            supabase.table("profiles")
            .select("lessonCompleted")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if response.data:
            if response.data.get("lessonCompleted") is False:
                return redirect(url_for('word'))
        else:
            return redirect(url_for('register_page'))

    except Exception as e:
        print(f"Error checking lesson status: {e}")
        return "An error occurred", 500

    return render_template("dashboard.html")


@app.route('/word')
def word():
    return render_template("word.html")


@app.route('/auth/google')
def auth_google():
    res = supabase.auth.sign_in_with_oauth({
        "provider": "google",
        "options": {
            "redirect_to": "http://127.0.0.1:5000/auth/callback",
            "flow_type": "pkce"
        }
    })
    return redirect(res.url)


@app.route('/auth/callback')
def auth_callback():
    code = request.args.get("code")
    if not code:
        return "Login failed", 400

    res     = supabase.auth.exchange_code_for_session({"auth_code": code})
    user_id = res.user.id
    session["user_id"] = user_id

    try:
        response = (
            supabase.table("profiles")
            .select("*")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not response.data:
            return redirect(url_for('register_page'))

        # Run streak check-in on every login
        _do_streak_checkin(user_id)

        return redirect(url_for('dashboard'))

    except Exception as e:
        print(f"Error fetching profile: {e}")
        return redirect(url_for('register_page'))


@app.route('/register', methods=['GET', 'POST'])
def register_page():
    if request.method == 'POST':
        user_interests = request.form.get("interests")
        supabase.table("profiles").insert({
            "id":        session["user_id"],
            "interests": user_interests
        }).execute()
        return redirect(url_for('dashboard'))
    return render_template("register.html")


# ─────────────────────────────────────────────────────────────
#  Existing AI routes (unchanged from your original)
# ─────────────────────────────────────────────────────────────
@app.route('/api/check', methods=['POST'])
def check_sentence():
    data          = request.json
    user_sentence = data.get('sentence', '')
    target_word   = data.get('word', '')

    if not user_sentence or not target_word:
        return jsonify({"error": "Missing sentence or word"}), 400

    system_prompt = f"""
    You are a helpful English language tutor. Your task is to evaluate a sentence written by the user to check if they correctly used a specific vocabulary word.

    Target Word: "{target_word}"
    User's Sentence: "{user_sentence}"

    Criteria for correctness:
    1. The exact target word (or a valid grammatical variation) MUST be included in the sentence.
    2. The word must be used correctly according to its definition and part of speech in context.
    3. The overall sentence should be grammatically sound.

    If the sentence is correct, set "correct" to true and provide an encouraging explanation.
    If the sentence is incorrect, set "correct" to false, explain exactly why, and provide a corrected version of their sentence.

    Respond ONLY with a valid JSON object in this exact format, with no markdown formatting or extra text:
    {{
    "correct": true,
    "explanation": "Your detailed feedback here."
    }}"""

    payload = {
        "model": "llama3.1-8b",
        "messages": [{"role": "system", "content": system_prompt}],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json"
    }

    try:
        response = requests.post(
            "https://api.cerebras.ai/v1/chat/completions",
            headers=headers, json=payload, timeout=10
        )
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.HTTPError as err:
        error_detail = response.json() if response.content else str(err)
        print(f"DEBUG - Check API Error: {error_detail}")
        return jsonify({"error": "Cerebras API Error", "details": error_detail}), response.status_code
    except Exception as e:
        print(f"DEBUG - Internal Error: {str(e)}")
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500


@app.route('/api/generate', methods=['POST'])
def generate_words():
    data          = request.json
    amount        = data.get('amount', 5)
    level         = data.get('level', 'B2')
    exclude_words = data.get('exclude_words', [])

    prompt = f"""
    Task: Select {amount} random English vocabulary word strictly at the {level} level.

    Constraints:
    - Exclusion: Do NOT use the words: {exclude_words}
    - Phonetics: Use the International Phonetic Alphabet (IPA).
    - Context: The example sentence should be sophisticated enough for a {level} learner.
    - Quiz: Generate {amount} distinct quiz questions based on the selected words (testing definitions, synonyms, or usage).
    - Output: Return ONLY a valid JSON object following the schema below.

    JSON Schema:
    {{
        "words": [
            {{
                "word": "Target {level} word",
                "word_form": "noun/verb/adjective/etc.",
                "phonetic": "/IPA transcription/",
                "vietnamese_translation": "A Vietnamese word equivalent",
                "definition": "Clear English definition",
                "example": "A high-quality example sentence illustrating the word's use.",
                "synonyms": ["synonym 1", "synonym 2", "synonym 3"]
            }}
        ],
        "quiz": [
            {{
                "question": "A question about the definition, synonym, or usage of the word.",
                "options": ["...", "...", "...", "..."],
                "answer": 0
            }}
        ]
    }}
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json"
    }
    payload = {
        "model":           "llama3.1-8b",
        "messages":        [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }

    try:
        response = requests.post(
            "https://api.cerebras.ai/v1/chat/completions",
            headers=headers, json=payload
        )
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.HTTPError as err:
        error_detail = response.json() if response.content else str(err)
        print(f"DEBUG - API Error: {error_detail}")
        return jsonify({"error": "Cerebras API Error", "details": error_detail}), response.status_code
    except Exception as e:
        print(f"DEBUG - Internal Error: {str(e)}")
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500


# ─────────────────────────────────────────────────────────────
#  Dashboard API — /api/user
#
#  GET  →  Returns full user data for the dashboard in one call:
#           profile info, streak, XP, tower progress, last_14_days.
#  Reads:   profiles, tower_progress, daily_scores
# ─────────────────────────────────────────────────────────────
@app.route('/api/user', methods=['GET'])
def get_user():
    uid, err = get_user_id()
    if err:
        return err

    today = date.today()

    user_res = (
        supabase.table("profiles")
        .select("*")
        .eq("id", uid)
        .single()
        .execute()
    )
    u = user_res.data
    if not u:
        return jsonify({"error": "User not found"}), 404

    # Increment session count on each dashboard load
    new_session_count = (u.get("session_count") or 0) + 1
    supabase.table("profiles").update({
        "session_count": new_session_count,
    }).eq("id", uid).execute()

    # Build last_14_days boolean array from daily_scores
    fourteen_days_ago = (today - timedelta(days=13)).isoformat()
    scores_res = (
        supabase.table("daily_scores")
        .select("date")
        .eq("user_id", uid)
        .gte("date", fourteen_days_ago)
        .execute()
    )
    active_dates = {row["date"] for row in (scores_res.data or [])}
    last_14_days = [
        (today - timedelta(days=i)).isoformat() in active_dates
        for i in range(13, -1, -1)
    ]

    # Tower progress
    tower_res = (
        supabase.table("tower_progress")
        .select("*")
        .eq("user_id", uid)
        .maybe_single()
        .execute()
    )
    tower = tower_res.data or {
        "current_wave": 1, "total_waves": 20,
        "castle_hp": 100, "towers_built": 0, "enemies_defeated": 0,
    }

    return jsonify({
        "display_name":   u.get("display_name", ""),
        "cefr_level":     u.get("cefr_level", "B2"),
        "session_count":  new_session_count,
        "streak_current": u.get("streak_current", 0) or 0,
        "streak_best":    u.get("streak_best", 0) or 0,
        "last_14_days":   last_14_days,
        "xp_today":       u.get("xp_today", 0) or 0,
        "xp_goal":        u.get("xp_goal", 100) or 100,
        "xp_total":       u.get("xp_total", 0) or 0,
        "words_learned":  u.get("words_learned", 0) or 0,
        "accuracy":       u.get("accuracy", 0) or 0,
        "tower": {
            "current_wave":     tower.get("current_wave", 1),
            "total_waves":      tower.get("total_waves", 20),
            "castle_hp":        tower.get("castle_hp", 100),
            "towers_built":     tower.get("towers_built", 0),
            "enemies_defeated": tower.get("enemies_defeated", 0),
        },
    })


# ─────────────────────────────────────────────────────────────
#  Dashboard API — /api/streak/checkin
#
#  POST  →  Advance or reset the streak.
#            Call this once when the user completes their
#            first quiz of the day (not on every login).
#  Writes:   profiles
# ─────────────────────────────────────────────────────────────
@app.route('/api/streak/checkin', methods=['POST'])
def streak_checkin():
    uid, err = get_user_id()
    if err:
        return err

    _do_streak_checkin(uid)

    user_res = (
        supabase.table("profiles")
        .select("streak_current, streak_best")
        .eq("id", uid)
        .single()
        .execute()
    )
    u = user_res.data or {}
    return jsonify({
        "streak_current": u.get("streak_current", 0),
        "streak_best":    u.get("streak_best", 0),
    })


# ─────────────────────────────────────────────────────────────
#  Dashboard API — /api/today-words
#
#  GET   →  Return today's saved word list.
#            { "words": [ { word, word_form, phonetic,
#              vietnamese_translation, definition,
#              example, synonyms }, ... ] }
#  POST  →  Save AI-generated words for today.
#            Body: { "words": [...] }
#  Reads/writes:  daily_words, profiles (words_learned)
# ─────────────────────────────────────────────────────────────
@app.route('/api/today-words', methods=['GET'])
def get_today_words():
    uid, err = get_user_id()
    if err:
        return err

    today = date.today().isoformat()
    res = (
        supabase.table("daily_words")
        .select("words")
        .eq("user_id", uid)
        .eq("date", today)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return jsonify({"words": []})
    return jsonify({"words": res.data["words"]})


@app.route('/api/today-words', methods=['POST'])
def save_today_words():
    uid, err = get_user_id()
    if err:
        return err

    today = date.today().isoformat()
    body  = request.get_json()

    if not body or "words" not in body:
        return jsonify({"error": "Missing 'words' field"}), 400

    # One row per user per day (requires unique constraint on user_id + date)
    supabase.table("daily_words").upsert({
        "user_id": uid,
        "date":    today,
        "words":   body["words"],
    }, on_conflict="user_id,date").execute()

    # Bump words_learned count on the profile
    user_res = (
        supabase.table("profiles")
        .select("words_learned")
        .eq("id", uid)
        .single()
        .execute()
    )
    current = (user_res.data or {}).get("words_learned", 0) or 0
    supabase.table("profiles").update({
        "words_learned": current + len(body["words"])
    }).eq("id", uid).execute()

    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────
#  Dashboard API — /api/chart
#
#  GET  →  Last 14 days of correct-answer counts.
#           Missing days filled with 0.
#           { "daily_scores": [ { "date": "YYYY-MM-DD",
#                                  "correct_count": int }, ... ] }
#  Reads:   daily_scores
# ─────────────────────────────────────────────────────────────
@app.route('/api/chart', methods=['GET'])
def get_chart():
    uid, err = get_user_id()
    if err:
        return err

    today             = date.today()
    fourteen_days_ago = (today - timedelta(days=13)).isoformat()

    res = (
        supabase.table("daily_scores")
        .select("date, correct_count")
        .eq("user_id", uid)
        .gte("date", fourteen_days_ago)
        .order("date", desc=False)
        .execute()
    )

    date_map = {row["date"]: row["correct_count"] for row in (res.data or [])}
    daily_scores = [
        {
            "date":          (today - timedelta(days=i)).isoformat(),
            "correct_count": date_map.get((today - timedelta(days=i)).isoformat(), 0),
        }
        for i in range(13, -1, -1)
    ]
    return jsonify({"daily_scores": daily_scores})


# ─────────────────────────────────────────────────────────────
#  Dashboard API — /api/mistakes
#
#  GET   →  Last 4 wrong quiz attempts.
#            { "mistakes": [ { question_text, user_answer,
#                               correct_answer, attempted_at }, ... ] }
#  POST  →  Save a quiz attempt (right or wrong).
#            Body: { "question_text": str, "user_answer": str,
#                    "correct_answer": str, "is_correct": bool }
#            Side-effects:
#              • Recalculates profiles.accuracy
#              • If is_correct=true: increments daily_scores.correct_count
#                and profiles.xp_today / xp_total
#  Reads/writes: quiz_attempts, profiles, daily_scores
# ─────────────────────────────────────────────────────────────
@app.route('/api/mistakes', methods=['GET'])
def get_mistakes():
    uid, err = get_user_id()
    if err:
        return err

    res = (
        supabase.table("quiz_attempts")
        .select("question_text, user_answer, correct_answer, attempted_at")
        .eq("user_id", uid)
        .eq("is_correct", False)
        .order("attempted_at", desc=True)
        .limit(4)
        .execute()
    )
    return jsonify({"mistakes": res.data or []})


@app.route('/api/mistakes', methods=['POST'])
def save_attempt():
    uid, err = get_user_id()
    if err:
        return err

    body     = request.get_json()
    required = ["question_text", "user_answer", "correct_answer", "is_correct"]
    for field in required:
        if field not in body:
            return jsonify({"error": f"Missing field: {field}"}), 400

    # Save the attempt
    supabase.table("quiz_attempts").insert({
        "user_id":        uid,
        "question_text":  body["question_text"],
        "user_answer":    body["user_answer"],
        "correct_answer": body["correct_answer"],
        "is_correct":     body["is_correct"],
        "attempted_at":   datetime.utcnow().isoformat(),
    }).execute()

    # Recalculate accuracy
    all_res = (
        supabase.table("quiz_attempts")
        .select("is_correct")
        .eq("user_id", uid)
        .execute()
    )
    all_attempts = all_res.data or []
    if all_attempts:
        correct  = sum(1 for a in all_attempts if a["is_correct"])
        accuracy = round(correct / len(all_attempts) * 100)
        supabase.table("profiles").update({
            "accuracy": accuracy
        }).eq("id", uid).execute()

    # If the answer was correct, update daily score + XP
    if body["is_correct"]:
        XP_PER_CORRECT = 5
        today = date.today().isoformat()

        existing = (
            supabase.table("daily_scores")
            .select("id, correct_count")
            .eq("user_id", uid)
            .eq("date", today)
            .maybe_single()
            .execute()
        )
        if existing.data:
            supabase.table("daily_scores").update({
                "correct_count": existing.data["correct_count"] + 1
            }).eq("id", existing.data["id"]).execute()
        else:
            supabase.table("daily_scores").insert({
                "user_id":       uid,
                "date":          today,
                "correct_count": 1,
            }).execute()

        user_res = (
            supabase.table("profiles")
            .select("xp_today, xp_total")
            .eq("id", uid)
            .single()
            .execute()
        )
        u = user_res.data or {}
        supabase.table("profiles").update({
            "xp_today": (u.get("xp_today") or 0) + XP_PER_CORRECT,
            "xp_total": (u.get("xp_total") or 0) + XP_PER_CORRECT,
        }).eq("id", uid).execute()

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)