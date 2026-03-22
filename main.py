import os
import random
import requests
from datetime import date, datetime, timedelta
from flask import Flask, render_template, redirect, request, session, url_for, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

API_KEY      = os.getenv("API_KEY")
SUPABASE_URL = "https://ypktiqorqpytqrfufbpj.supabase.co"
SUPABASE_KEY = "sb_publishable_r3U8mKoht6QE22lYTJ5D0Q_VqnT2bNm"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
app.secret_key = API_KEY

# ════════════════════════════════════════════════════════
#  AUTH HELPER
# ════════════════════════════════════════════════════════
def get_uid():
    return session.get("user_id")

def login_required_api(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_uid():
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return decorated

def login_required_page(f):
    """Redirect unauthenticated users to '/' for page routes."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_uid():
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated


# ════════════════════════════════════════════════════════
#  PAGE ROUTES
# ════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/shop')
def shop():
    return render_template("shop.html")

@app.route('/dashboard')
@login_required_page
def dashboard():
    user_id = get_uid()

    try:
        response = supabase.table("profiles").select("lessonCompleted").eq("id", user_id).maybe_single().execute()

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
@login_required_page
def word():
    return render_template("word.html")


@app.route('/account')
@login_required_page
def account():
    return render_template("account.html")


@app.route('/tower')
@login_required_page
def tower():
    return render_template("tower.html")


# ════════════════════════════════════════════════════════
#  AUTH
# ════════════════════════════════════════════════════════

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

    res = supabase.auth.exchange_code_for_session({"auth_code": code})
    user_id = res.user.id

    session["user_id"]       = user_id
    session["access_token"]  = res.session.access_token
    session["refresh_token"] = res.session.refresh_token

    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).maybe_single().execute()

        if not response.data:
            return redirect(url_for('register_page'))

        return redirect(url_for('dashboard'))

    except Exception as e:
        print(f"Error fetching profile: {e}")
        return redirect(url_for('register_page'))


@app.route('/register', methods=['GET', 'POST'])
@login_required_page
def register_page():
    if request.method == 'POST':
        skill_level    = request.form.get("skill_level")
        user_interests = request.form.get("interests")
        supabase.table("profiles").insert({
            "id":        session["user_id"],
            "level":     skill_level,
            "interests": user_interests
        }).execute()
        return redirect(url_for('dashboard'))

    return render_template("register.html")


# ════════════════════════════════════════════════════════
#  /api/session
# ════════════════════════════════════════════════════════

@app.route('/api/session', methods=['GET'])
def get_session():
    access_token  = session.get("access_token")
    refresh_token = session.get("refresh_token")

    if not access_token:
        return jsonify({"error": "No session"}), 401

    return jsonify({
        "access_token":  access_token,
        "refresh_token": refresh_token,
    })


# ════════════════════════════════════════════════════════
#  AI ROUTES
# ════════════════════════════════════════════════════════

@app.route('/api/check', methods=['POST'])
@login_required_api
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
        "model": "qwen-3-235b-a22b-instruct-2507",
        "messages": [{"role": "system", "content": system_prompt}],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
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
@login_required_api
def generate_words():
    data          = request.json
    level         = data.get('level', '')
    interests     = data.get('interests', '')
    exclude_words = data.get('exclude_words', [])

    prompt = f"""
    Task: Select 5 random English vocabulary word strictly at the {level} level.

    Constraints:
    - Exclusion: Do NOT use the words: {exclude_words}
    - Phonetics: Use the International Phonetic Alphabet (IPA).
    - Context: The example sentence should be sophisticated enough for a {level} learner.
    - The Words: Select words that are high-frequency, general, and essential for daily life (e.g., efficient, collaborate, adapt, versatile). Strictly avoid niche technical jargon or industry-specific terms (e.g., do NOT use "Trojan horse" or "refactoring").
    - The Examples: For every word, write a creative example sentence specifically tailored to the user's interest in {interests}. The sentence must use the general word in a way that resonates with that interest without making the word itself technical.
    - The Goal: The user should learn a word they can use anywhere, but the example should make them smile because it relates to what they love.
    - Quiz: Generate 5 distinct quiz questions based on the selected words (testing definitions, synonyms, or usage).
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
        "Content-Type": "application/json"
    }

    payload = {
        "model": "qwen-3-235b-a22b-instruct-2507",
        "messages": [{"role": "user", "content": prompt}],
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


# ════════════════════════════════════════════════════════
#  NEW: /api/generate-custom
#  Picks up to 5 words from the user's custom_words list
#  (server-side sampling so the client can't be spoofed),
#  then asks the AI to build a full lesson for those words.
#  No {level} constraint — just rich vocab cards + quiz.
# ════════════════════════════════════════════════════════

@app.route('/api/generate-custom', methods=['POST'])
@login_required_api
def generate_custom_words():
    body          = request.json
    custom_words  = body.get('custom_words', [])
    exclude_words = body.get('exclude_words', [])
    interests     = body.get('interests', '')

    if not custom_words:
        return jsonify({"error": "No custom words provided"}), 400

    # ── Filter out any that slipped through the client-side check ──
    excluded_set     = {w.lower() for w in exclude_words}
    available        = [w for w in custom_words if w.lower() not in excluded_set]

    if not available:
        return jsonify({"error": "All custom words are excluded"}), 400

    # ── Pick up to 5 at random (server-side) ──
    selected = random.sample(available, min(5, len(available)))

    # ── If fewer than 5 custom words are available, pad with a note ──
    # The AI will still produce valid output for however many words we give it.
    word_list_str = ", ".join(selected)

    prompt = f"""
    Task: Create a vocabulary lesson for exactly these English words: {word_list_str}

    Instructions:
    - Use ONLY the words listed above. Do not substitute or add other words.
    - Phonetics: Use the International Phonetic Alphabet (IPA).
    - Examples: Write a creative example sentence for each word tailored to the user's interest in "{interests}". If no interest is given, write a general but vivid sentence.
    - Quiz: Generate exactly 5 quiz questions based on the provided words (definitions, synonyms, or usage). If fewer than 5 words were given, create multiple questions per word.
    - Output: Return ONLY a valid JSON object following the schema below.

    JSON Schema:
    {{
        "words": [
            {{
                "word": "the exact word from the list",
                "word_form": "noun/verb/adjective/etc.",
                "phonetic": "/IPA transcription/",
                "vietnamese_translation": "A Vietnamese word equivalent",
                "definition": "Clear English definition",
                "example": "A vivid example sentence illustrating the word's use.",
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
        "Content-Type": "application/json"
    }

    payload = {
        "model": "qwen-3-235b-a22b-instruct-2507",
        "messages": [{"role": "user", "content": prompt}],
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
        print(f"DEBUG - Custom API Error: {error_detail}")
        return jsonify({"error": "Cerebras API Error", "details": error_detail}), response.status_code
    except Exception as e:
        print(f"DEBUG - Internal Error: {str(e)}")
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500


# ════════════════════════════════════════════════════════
#  DASHBOARD API ROUTES
# ════════════════════════════════════════════════════════

@app.route('/api/user', methods=['GET'])
@login_required_api
def get_user():
    uid   = get_uid()
    today = date.today()

    profile_res = (
        supabase.table("profiles")
        .select("*")
        .eq("id", uid)
        .maybe_single()
        .execute()
    )
    u = profile_res.data
    if not u:
        return jsonify({"error": "Profile not found"}), 404

    streak   = u.get("streak_current", 0)
    xp_today = u.get("xp_today", 0)
    last_active = u.get("last_active_date")

    if last_active:
        last_active_date = datetime.fromisoformat(str(last_active)).date()
        if (today - last_active_date).days > 1:
            streak   = 0
            xp_today = 0
            supabase.table("profiles").update({
                "streak_current": 0, "xp_today": 0,
            }).eq("id", uid).execute()

    new_session_count = u.get("session_count", 0) + 1
    supabase.table("profiles").update({
        "session_count":    new_session_count,
        "last_active_date": today.isoformat(),
    }).eq("id", uid).execute()

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
        "cefr_level":     u.get("level", "B2"),
        "session_count":  new_session_count,
        "streak_current": streak,
        "streak_best":    u.get("streak_best", 0),
        "last_14_days":   last_14_days,
        "xp_today":       xp_today,
        "xp_goal":        u.get("xp_goal", 100),
        "xp_total":       u.get("xp_total", 0),
        "words_learned":  u.get("words_learned", 0),
        "accuracy":       u.get("accuracy", 0),
        "tower": {
            "current_wave":     tower.get("current_wave", 1),
            "total_waves":      tower.get("total_waves", 20),
            "castle_hp":        tower.get("castle_hp", 100),
            "towers_built":     tower.get("towers_built", 0),
            "enemies_defeated": tower.get("enemies_defeated", 0),
        },
    })

@app.route('/api/generate-quiz', methods=['POST'])
def generate_quiz():
    data = request.json
    words = data.get('words', [])
    
    if not words:
        return jsonify({"error": "No words provided"}), 400

    payload = {
        "model": "qwen-3-235b-a22b-instruct-2507",
        "messages": [
            {
                "role": "user",
                "content": f"You are a vocabulary quiz generator. Given this list of English words: [{', '.join(words)}]\n\nPick ONE word and create a multiple-choice question. Provide exactly 4 options (A–D). Respond ONLY with a valid JSON object:\n{{\n  \"word\": \"...\",\n  \"question\": \"...\",\n  \"options\": [\"...\", \"...\", \"...\", \"...\"],\n  \"correctIndex\": 0,\n  \"reward\": 250\n}}"
            }
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post("https://api.cerebras.ai/v1/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        
        # Extract the nested JSON string from Cerebras and parse it
        result = response.json()
        quiz_data = result['choices'][0]['message']['content']
        
        return quiz_data, 200, {'Content-Type': 'application/json'}
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/streak/checkin', methods=['POST'])
@login_required_api
def streak_checkin():
    uid   = get_uid()
    today = date.today()

    res = (
        supabase.table("profiles")
        .select("streak_current, streak_best, last_active_date")
        .eq("id", uid)
        .maybe_single()
        .execute()
    )
    u = res.data
    if not u:
        return jsonify({"error": "Profile not found"}), 404

    last_active = u.get("last_active_date")
    streak = u.get("streak_current", 0)
    best   = u.get("streak_best", 0)

    if last_active:
        last_active_date = datetime.fromisoformat(str(last_active)).date()
        days_since = (today - last_active_date).days
        if days_since == 1:
            streak += 1
        elif days_since > 1:
            streak = 1
    else:
        streak = 1

    best = max(best, streak)

    supabase.table("profiles").update({
        "streak_current":   streak,
        "streak_best":      best,
        "last_active_date": today.isoformat(),
    }).eq("id", uid).execute()

    return jsonify({"streak_current": streak, "streak_best": best})


@app.route('/api/today-words', methods=['GET'])
@login_required_api
def get_today_words():
    uid   = get_uid()
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
@login_required_api
def save_today_words():
    uid   = get_uid()
    today = date.today().isoformat()
    body  = request.get_json()

    if not body or "words" not in body:
        return jsonify({"error": "Missing 'words' field"}), 400

    supabase.table("daily_words").upsert({
        "user_id": uid,
        "date":    today,
        "words":   body["words"],
    }, on_conflict="user_id,date").execute()

    return jsonify({"ok": True})


@app.route('/api/chart', methods=['GET'])
@login_required_api
def get_chart():
    uid   = get_uid()
    today = date.today()
    since = (today - timedelta(days=13)).isoformat()

    res = (
        supabase.table("daily_scores")
        .select("date, correct_count")
        .eq("user_id", uid)
        .gte("date", since)
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


@app.route('/api/chart/increment', methods=['POST'])
@login_required_api
def increment_correct():
    uid   = get_uid()
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
        new_count = existing.data["correct_count"] + 1
        supabase.table("daily_scores").update({
            "correct_count": new_count,
        }).eq("id", existing.data["id"]).execute()
    else:
        new_count = 1
        supabase.table("daily_scores").insert({
            "user_id": uid, "date": today, "correct_count": 1,
        }).execute()

    return jsonify({"correct_count": new_count})


@app.route('/api/mistakes', methods=['GET'])
@login_required_api
def get_mistakes():
    uid = get_uid()

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
@login_required_api
def save_attempt():
    uid  = get_uid()
    body = request.get_json()

    required = ["question_text", "user_answer", "correct_answer", "is_correct"]
    for field in required:
        if field not in body:
            return jsonify({"error": f"Missing field: {field}"}), 400

    supabase.table("quiz_attempts").insert({
        "user_id":        uid,
        "question_text":  body["question_text"],
        "user_answer":    body["user_answer"],
        "correct_answer": body["correct_answer"],
        "is_correct":     body["is_correct"],
        "attempted_at":   datetime.utcnow().isoformat(),
    }).execute()

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
        supabase.table("profiles").update({"accuracy": accuracy}).eq("id", uid).execute()

    return jsonify({"ok": True})


# ════════════════════════════════════════════════════════
if __name__ == "__main__":
    app.run(debug=True)