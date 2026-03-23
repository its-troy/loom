# [![loom - vocab made simple](https://i.ibb.co/jZhtNDSg/loom.png)](https://loom-1elr.onrender.com/)

**Loom** is an AI-powered vocabulary engine designed to bridge the gap between passive memorization and active language production. Built for students tackling high-stakes exams (like the 10th-grade entrance exams), Loom turns the "chore" of studying into the "fuel" for a strategic Tower Defense game.

## 🚀 The Core Loop
Loom utilizes a research-backed, multi-tiered learning cycle to fight the "Forgetting Curve":
1. **AI Word Profiles:** Qwen 3 generates context-rich definitions, synonyms, and examples tailored to your skill level.
2. **TTS Micro-Checks:** Use Text-to-Speech auditory cues to verify spelling and sentence structure in real-time.
3. **The Daily Quiz:** A high-stakes 5-question gauntlet to test your retention and earn premium currency.
4. **Tower Defense:** Use your hard-earned knowledge to buy defenses, upgrade towers, and survive waves of enemies.

## ✨ Key Features
* **Custom Syllabus Integration:** Students can input their own vocabulary lists from school to ensure they are studying exactly what they need for their next test.
* **Dual-Currency Economy:**
    + Loomlars: Earned via the Daily Quiz; used for cosmetic upgrades in the Shop.
    + Credits: Earned via gameplay and quick-fire questions; used to build and upgrade towers.
* **Active Feedback:** Real-time AI validation of your grammar and word usage.
* **Personalized Dashboard:** Track your streaks, total words mastered, and review "Recent Mistakes."

## 🛠️ Tech Stack
* **LLM:** Qwen 3 235B (via Cerebras) for high-fidelity JSON generation and semantic grading.
* **Backend:** Flask (Python)
* **Database:** Supabase (PostgreSQL) for user progress and currency tracking.
* **Frontend:** HTML5 Canvas, JavaScript, and Tailwind CSS.

---

## ⚙️ Installation & Build

Loom uses [uv](https://github.com/astral-sh/uv) for extremely fast Python package and project management.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/loom.git
cd loom
```

### 2. Environment Configuration
To power the AI engine, you must provide a valid API key from [Cerebras](https://www.cerebras.ai/).

1. Create a new file in the root directory named `.env`.
2. Open the file and add your Cerebras API key:

```env
API_KEY=your_cerebras_api_key_here
```

### 3. Run the Application
You do not need to manually manage a virtual environment or install a `requirements.txt`. Simply run:

```bash
uv run main.py
```

Navigate to `http://localhost:5000` in your browser to start weaving your knowledge!

---

## 🏆 Hackathon Recognition
Loom was developed in 36 hours for **[LotusHack 2026](https://www.lotushack.org/)**.

In a highly competitive field of **220 teams**, Loom placed **55th overall (Top 25%)**. The project was recognized by judges for its technical ambition in integrating high-parameter LLMs with a functional, dual-currency gaming economy to solve real-world educational challenges.
