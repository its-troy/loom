const loading_screen = document.querySelector('.loading_screen');
const main = document.querySelector('.main');
const quiz = document.querySelector('.quiz');
const phonetic = document.querySelector('.phonetic');
const main_next_button = document.querySelector('#main_button .next_button');
const main_back_button = document.querySelector('#main_button .back_button');
const gen_button = document.querySelector('.gen_button');

const word = document.getElementById('word');
const word_form = document.getElementById('word_form');
const vietnamese_translation = document.getElementById('vietnamese_translation');
const definition = document.getElementById('definition');
const example = document.getElementById('example');
const synonym = document.querySelectorAll('.synonym');

const question = document.querySelector('.quiz_info h1');
const options = document.querySelectorAll('.options span');
const options_container = document.querySelectorAll('.options');
const progress_bar = document.querySelector('.progress_bar');
const progress_text = document.querySelector('.quiz_info p span');
const quiz_next_button = document.querySelector('#quiz_button .next_button');
const quiz_back_button = document.querySelector('#quiz_button .back_button');

const sentence = document.querySelector('.sentence');
const it_button = document.querySelector('.it_button');
const sentence_next_button = document.querySelector('#sentence_button .next_button');
const check_button = document.querySelector('#sentence_button .back_button');
const explanation = document.getElementById('explanation');
const input = document.querySelector('#input');

let known_words   = [];
let exclude_words = [];
let custom_words  = [];   // ← NEW
let level         = "B2";
let interests     = "";

let quizAnswers   = [];

let quiz_index = 0;
let word_index = 0;
let correct_answers = 0;
let data;

const SUPABASE_URL      = "https://ypktiqorqpytqrfufbpj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r3U8mKoht6QE22lYTJ5D0Q_VqnT2bNm";
const supabaseClient    = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════
async function init() {
  await restoreSession();
  await loadUserWordLists();
  await getWord(interests);
  setWord();
}

init();

// ── Play SFX ─────────────────────────────────────────────────────
function playSFX(soundId) {
  const sound = document.getElementById(`sfx-${soundId}`);
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.log("Audio playback blocked until user interaction."));
  }
}

// ── Restore Supabase JS session ──────────────────────────────────
async function restoreSession() {
  try {
    const res = await fetch('/api/session');
    if (!res.ok) { console.warn("No Flask session found."); return; }
    const { access_token, refresh_token } = await res.json();
    await supabaseClient.auth.setSession({ access_token, refresh_token });
    console.log("Supabase JS session restored.");
  } catch (err) {
    console.error("Failed to restore session:", err);
  }
}

// ── Load profile fields from Supabase ───────────────────────────
async function loadUserWordLists() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabaseClient
    .from('profiles')
    // ↓ CHANGED: added custom_words to the select
    .select('known_words, exclude_words, custom_words, level, interests')
    .eq('id', user.id)
    .single();

  if (profile) {
    known_words   = profile.known_words   || [];
    exclude_words = profile.exclude_words || [];
    custom_words  = profile.custom_words  || [];   // ← NEW
    level         = profile.level         || 'B2';
    interests     = profile.interests     || '';
  }

  console.log(
    `Loaded — level: ${level}, interests: "${interests}", ` +
    `known: ${known_words.length}, excluded: ${exclude_words.length}, ` +
    `custom: ${custom_words.length}`   // ← NEW log
  );
}

// ── Save current lesson to Supabase (always overwrites) ─────────
async function saveLessonToSupabase() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user || !data) return;

  const today = new Date().toISOString().slice(0, 10);

  await supabaseClient
    .from('profiles')
    .update({
      current_lesson: data,
      lesson_date:    today,
    })
    .eq('id', user.id);
}

// ── Save known_words ─────────────────────────────────────────────
async function saveKnownWords() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user || !data) return;

  const parsedWords = JSON.parse(data.choices[0].message.content).words;
  const newWords    = parsedWords.map(w => w.word.toLowerCase());
  const merged      = [...new Set([...known_words, ...newWords])];
  known_words       = merged;

  await supabaseClient
    .from('profiles')
    .update({ known_words: merged })
    .eq('id', user.id);

  console.log(`known_words updated → ${merged.length} total`);
}

// ── Add current words to exclude_words, then reload ──────────────
async function handleGenerate() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user && data) {
    const parsedWords  = JSON.parse(data.choices[0].message.content).words;
    const currentWords = parsedWords.map(w => w.word.toLowerCase());
    const merged       = [...new Set([...exclude_words, ...currentWords])];

    await supabaseClient
      .from('profiles')
      .update({
        exclude_words:  merged,
        current_lesson: null,
        lesson_date:    null,
      })
      .eq('id', user.id);

    console.log(`exclude_words updated → ${merged.length} total`);
  }

  window.location.reload();
}

// ── Record a quiz answer → quiz_attempts + daily_scores ──────────
async function recordQuizAnswer(questionIndex, userAnswerText, correctAnswerText, isCorrect) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const now   = new Date().toISOString();
  const today = now.slice(0, 10);

  const parsedContent = JSON.parse(data.choices[0].message.content);
  const questionText  = parsedContent.quiz[questionIndex]?.question || '';

  await supabaseClient.from('quiz_attempts').insert({
    user_id:        user.id,
    question_text:  questionText,
    user_answer:    userAnswerText,
    correct_answer: correctAnswerText,
    is_correct:     isCorrect,
    attempted_at:   now,
  });

  if (isCorrect) {
    const { data: existing } = await supabaseClient
      .from('daily_scores')
      .select('id, correct_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      await supabaseClient
        .from('daily_scores')
        .update({ correct_count: existing.correct_count + 1 })
        .eq('id', existing.id);
    } else {
      await supabaseClient
        .from('daily_scores')
        .insert({ user_id: user.id, date: today, correct_count: 1 });
    }
  }

  const { data: allAttempts } = await supabaseClient
    .from('quiz_attempts')
    .select('is_correct')
    .eq('user_id', user.id);

  if (allAttempts?.length) {
    const correctCount = allAttempts.filter(a => a.is_correct).length;
    const accuracy     = Math.round(correctCount / allAttempts.length * 100);
    await supabaseClient
      .from('profiles')
      .update({ accuracy })
      .eq('id', user.id);
  }
}

// Listeners
for (let i = 0; i < options_container.length; i++) {
  options_container[i].addEventListener('click', () => {
    if (document.querySelector('.answered')) return;

    const selected_option = document.querySelector('.selected_option');
    if (selected_option) selected_option.classList.remove('selected_option');
    options_container[i].classList.add('selected_option');

    const content      = JSON.parse(data.choices[0].message.content).quiz[quiz_index];
    const correctIndex = content.answer;
    const isCorrect    = i === correctIndex;

    options_container.forEach(opt => opt.classList.add('answered'));

    if (isCorrect) {
      options_container[i].classList.add('correct');
      playSFX('correct');
      correct_answers++;
    } else {
      options_container[i].classList.add('incorrect');
      playSFX('incorrect');
      options_container[correctIndex].classList.add('selected_option');
      options_container[correctIndex].classList.add('correct');
    }

    const userAnswerText    = content.options[i];
    const correctAnswerText = content.options[correctIndex];
    recordQuizAnswer(quiz_index, userAnswerText, correctAnswerText, isCorrect);

    quiz_next_button.classList.remove('disabled');
  });
}

quiz_next_button.addEventListener('click', () => {
  if (quiz_index < 4) {
    quiz_index++;
    setQuiz();
  } else {
    quiz_next_button.classList.add("disabled");
    showResults();
  }
});

phonetic.addEventListener('click', () => {
  let msg = new SpeechSynthesisUtterance(word.textContent);
  window.speechSynthesis.speak(msg);
});

it_button.addEventListener('click', () => {
  let msg = new SpeechSynthesisUtterance(word.textContent);
  window.speechSynthesis.speak(msg);
});

sentence_next_button.addEventListener('click', () => {
  sentence.style.right = "100%";
  sentence_next_button.classList.add("disabled");
  if (word_index != 4) {
    word_index++;
    setWord();
  } else {
    word_index = 5;
    main.style.display = "none";
    quiz.style.animation = 'slide 1s cubic-bezier(1,0,0,1) forwards';
    setQuiz();
  }
  if (sentence.style.right == "100%") {
    check_button.classList.remove('disabled');
    input.value = "";
    explanation.hidden = true;
    sentence.hidden = true;
  }
});

check_button.addEventListener('click', () => {
  const userSentence = input.value.trim();
  const targetWord = word.textContent;

  if (!userSentence) {
    alert("Please write a sentence first!");
    return;
  }

  input.readOnly = true;
  check_button.classList.add('disabled');
  explanation.innerHTML = '<svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><radialGradient id="a12" cx=".66" fx=".66" cy=".3125" fy=".3125" gradientTransform="scale(1.5)"><stop offset="0" stop-color="#F2E9E4"></stop><stop offset=".3" stop-color="#F2E9E4" stop-opacity=".9"></stop><stop offset=".6" stop-color="#F2E9E4" stop-opacity=".6"></stop><stop offset=".8" stop-color="#F2E9E4" stop-opacity=".3"></stop><stop offset="1" stop-color="#F2E9E4" stop-opacity="0"></stop></radialGradient><circle transform-origin="center" fill="none" stroke="url(#a12)" stroke-width="30" stroke-linecap="round" stroke-dasharray="200 1000" stroke-dashoffset="0" cx="100" cy="100" r="70"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="2" values="360;0" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></circle><circle transform-origin="center" fill="none" opacity=".2" stroke="#F2E9E4" stroke-width="30" stroke-linecap="round" cx="100" cy="100" r="70"></circle></svg>';
  explanation.hidden = false;

  checkSentence(userSentence, targetWord).then((result) => {
    if (result.correct) {
      playSFX('correct');
      explanation.innerHTML = `<span style="color: #4CAF50;">✅ <strong>Great job!</strong></span><br><br>${result.explanation}`;
      sentence_next_button.classList.remove('disabled');
    } else {
      playSFX('incorrect');
      explanation.innerHTML = `<span style="color: #F44336;">❌ <strong>Not quite right.</strong></span><br><br>${result.explanation}`;
      input.readOnly = false;
      check_button.classList.remove('disabled');
    }
  });
});

main_next_button.addEventListener('click', () => {
  sentence.style.right = "0%";
  sentence.hidden = false;
  input.readOnly = false;
});

main_back_button.addEventListener('click', () => {
  if (word_index != 0) {
    word_index--;
    setWord();
  }
});

gen_button.addEventListener('click', () => {
  handleGenerate();
});

// Functions
async function checkSentence(userSentence, targetWord) {
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence: userSentence, word: targetWord })
    });

    if (!response.ok) throw new Error("Server Error");

    const data = await response.json();
    let resultContent = data.choices[0].message.content;

    if (typeof resultContent === 'string') {
      return JSON.parse(resultContent);
    }
    return resultContent;

  } catch (error) {
    console.error("Failed to check sentence:", error);
    return {
      correct: false,
      explanation: "Sorry, the server couldn't check your sentence right now. Please try again."
    };
  }
}

function setQuiz() {
  const content = JSON.parse(data.choices[0].message.content).quiz[quiz_index];
  question.textContent = content.question;
  progress_text.textContent = quiz_index + 1;
  progress_bar.style.width = `${(quiz_index + 1) / 5 * 100}%`;

  for (let i = 0; i < options.length; i++) {
    options[i].textContent = content.options[i];
  }

  options_container.forEach(opt => {
    opt.classList.remove('answered', 'selected_option', 'correct', 'incorrect');
  });

  quiz_next_button.classList.add('disabled');
  quiz_back_button.classList.toggle('disabled', quiz_index === 0);
}

function setWord() {
  const content = JSON.parse(data.choices[0].message.content).words[word_index];
  word.textContent = content.word;
  word_form.textContent = content.word_form;
  phonetic.textContent = content.phonetic;
  vietnamese_translation.textContent = content.vietnamese_translation;
  definition.textContent = content.definition;
  example.innerHTML = content.example.replace(content.word.toLowerCase(), '<strong>' + content.word.toLowerCase() + '</strong>');

  for (let i = 0; i < synonym.length; i++) {
    synonym[i].textContent = content.synonyms[i];
  }

  if (word_index == 0) {
    main_back_button.classList.add('disabled');
  } else {
    main_back_button.classList.remove('disabled');
  }

  loading_screen.style.clipPath = "inset(0% 0% 100% 0%)";
}

async function showResults() {
  const total    = 5;
  const pct      = Math.round((correct_answers / total) * 100);
  const loomlars = correct_answers;

  const { data: { user } } = await supabaseClient.auth.getUser();

  await saveLessonToSupabase();
  await saveKnownWords();

  let loomlarEarned = 0;

  if (user) {
    const { data: profile, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('loomlars, lessonCompleted')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error("Error fetching current loomlars:", fetchError.message);
    } else {
      const currentLoomlars  = profile.loomlars        || 0;
      const alreadyCompleted = profile.lessonCompleted === true;

      if (alreadyCompleted) {
        console.log("Lesson already completed — no Loomlars awarded.");
        loomlarEarned = 0;

        await supabaseClient
          .from('profiles')
          .update({ lessonCompleted: true })
          .eq('id', user.id);

      } else {
        loomlarEarned = loomlars;

        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            lessonCompleted: true,
            loomlars:        currentLoomlars + loomlars,
            loomlars_today:  loomlars,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error("Supabase Update Error:", updateError.message);
        } else {
          console.log("Progress and added loomlars saved!");
        }
      }
    }
  } else {
    console.log("User not logged in; progress not saved.");
  }

  let headline = "Keep practicing!";
  if (pct === 100) headline = "Perfect score!";
  else if (pct >= 80) headline = "Impressive!";
  else if (pct >= 60) headline = "Good work!";
  playSFX('confetti');

  const badgeText = loomlarEarned > 0
    ? `${loomlarEarned} Loomlar${loomlarEarned !== 1 ? 's' : ''} earned!`
    : `Already completed today — no Loomlars awarded.`;

  const loomlarSVG = `<svg class="loomlar-icon-svg" viewBox="0 0 563 562" version="1.1" xmlns="http://www.w3.org/2000/svg" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <g transform="matrix(1,0,0,1,-1261,-14.113438)">
      <path d="M1530.5,574.5C1513.4,570.6 1501.5,562.9 1494.8,551.1C1493.5,548.8 1491.6,546.7 1490.5,546.5C1472.1,542.2 1427.4,541.1 1393,544.1C1366,546.4 1316.8,554.8 1282.8,562.9C1268.8,566.3 1266.8,566.1 1263.1,561.4L1261,558.7L1261,315.1C1261,150.6 1261.3,70.3 1262,67.8C1263.8,61.6 1265.5,61 1281.6,61C1289.4,61 1296.5,60.7 1297.4,60.4C1298.8,59.9 1299,57.6 1299,45.8C1299,29.9 1299.9,26.8 1305.2,25.1C1313.9,22.4 1350.1,16.9 1372.9,14.9C1390.3,13.4 1430.6,14.2 1446.5,16.5C1485.2,21.8 1516,33.9 1539,52.6L1546.6,58.7L1550.5,55.3C1556.6,50.2 1571.6,40.2 1579.1,36.4C1601.2,25.3 1624,18.9 1654.1,15.4C1673.3,13.2 1714.8,13.9 1739.5,16.9C1759,19.3 1784.3,23.5 1788.1,25.1C1792.4,26.8 1793,29.4 1793.3,45.5L1793.5,60.5L1808.8,60.8L1824,61.1L1824,565.9L1820.8,565.3C1819,565 1812.8,563.6 1807,562.3C1729.7,544.3 1667.1,538.5 1615.4,544.5C1608.3,545.4 1601.8,546.3 1601,546.5C1600.2,546.8 1598.7,548.8 1597.7,550.9C1593.2,560.7 1579.5,570 1563.6,574C1554.4,576.3 1539.8,576.5 1530.5,574.5ZM1554.9,559C1568.9,557.2 1579,550.7 1584.1,540.5C1585.8,536.9 1587.8,533.6 1588.5,533C1592.8,529.4 1626.8,526 1659.1,526C1703.4,526 1743.7,530.9 1795.7,542.6C1804,544.5 1811.5,546 1812.4,546C1813.9,546 1814,525.1 1814,312.1L1814,78.2L1804.8,77.8C1799.7,77.5 1795.2,77.5 1794.8,77.7C1794.3,77.9 1794,174.7 1794,292.8C1794,437.5 1793.7,508.7 1793,511.2C1791.8,515.4 1788.8,518 1785.2,518C1783.9,518 1776.2,516.2 1768.1,514C1728,503.2 1698.6,498.8 1666.5,498.7C1642.2,498.7 1631.5,499.9 1612.5,505C1590,511 1573.3,519.3 1553.2,534.7C1546.9,539.5 1544.6,539.1 1536,531.9C1533.5,529.9 1527.5,525.7 1522.5,522.7C1484.6,499.8 1440.2,493.3 1381,502.1C1365.1,504.5 1335.8,510.8 1321,515C1308.1,518.7 1304.7,518.8 1301.5,515.5L1299,513.1L1299,78.2L1291.8,77.5C1287.8,77.1 1283.2,77 1281.5,77.2L1278.5,77.5L1278.2,311.9L1278,546.3L1281.7,545.7C1283.8,545.4 1294.1,543.3 1304.5,541C1356.4,529.7 1395.9,525.4 1442.3,526.3C1469.9,526.8 1498.2,529.4 1503,532C1504,532.5 1505.8,535.1 1507,537.7C1512.9,550.4 1522.1,556.5 1539.5,559C1546.5,560 1546.7,560 1554.9,559ZM1564.4,506.5C1582.7,495.5 1607.2,487.2 1632.1,483.4C1647.8,481 1682.2,481 1702,483.4C1721.2,485.7 1739,489 1758.5,494C1767.3,496.2 1775.1,498 1775.8,498C1776.7,498 1777,451.5 1777,269C1777,143.1 1776.9,40 1776.7,40C1776.6,40 1771.8,39.1 1766,38C1724.5,30.1 1678.7,28.4 1644.5,33.5C1610.9,38.6 1579.3,52 1560.8,69.2L1555.1,74.5L1554.8,293.3C1554.6,413.6 1554.6,512 1554.8,512C1555,512 1559.3,509.5 1564.4,506.5ZM1538,293.5L1538,76L1534.3,72C1528.6,65.7 1516.4,56.9 1505.2,51.1C1468.7,32.4 1414.5,26 1355.5,33.5C1339.8,35.6 1320.1,38.9 1317.3,40L1315,41L1315,270C1315,487.8 1315.1,499.1 1316.8,498.6C1332,493.8 1370,485.9 1390.5,483.4C1410,480.9 1445.3,480.9 1460.9,483.3C1485.5,487.2 1511.6,496 1527.8,506C1532,508.6 1536.1,510.8 1536.8,510.9C1537.7,511 1538,466.9 1538,293.5Z" style="fill-rule:nonzero;"/>
      <path d="M1617.9,396.8C1617.6,369.7 1618.4,364.3 1623.6,357.4C1627.9,351.8 1634.1,348.8 1642.4,348.2C1655.1,347.4 1663.7,351.7 1668.7,361.2C1671.2,366 1671.5,367.7 1671.8,379.8L1672.2,393L1706,393L1706,405L1618,405L1617.9,396.8ZM1660.8,381.1C1660.5,370.9 1660.2,368.7 1658.4,366.4C1653.1,359.2 1644.7,357.2 1637,361.2C1630.1,364.8 1628.6,368.3 1628.1,381.8L1627.8,393L1661.2,393L1660.8,381.1Z" style="fill-rule:nonzero;"/>
      <path d="M1611,332L1611,303L1696,303L1696,285L1700.9,285C1703.7,285 1706.1,285.4 1706.4,285.8C1706.6,286.2 1706.6,296.8 1706.3,309.3L1705.7,332L1696.1,332L1695.8,323.3L1695.5,314.5L1658.8,314.2L1622,314L1622,332L1611,332Z" style="fill-rule:nonzero;"/>
      <path d="M1679.9,269.5C1670,266.4 1665,256.5 1664.6,239.7L1664.4,230.5L1660.3,230.6C1655.1,230.7 1651.2,233.2 1649.4,237.5C1646.4,244.8 1648.8,254.2 1654.3,256.8C1656.8,258 1657,258.6 1657,263.6C1657,269.7 1656.6,269.9 1650.4,267.1C1645.5,264.9 1640.7,259.3 1639.1,254.1C1637.7,249.2 1637.7,238.3 1639.1,233.9C1640.9,228.7 1644.7,224.2 1649.3,221.8C1653.2,219.7 1655.2,219.5 1678.5,219C1692.3,218.7 1704.1,218.1 1704.8,217.7C1705.7,217.1 1706,218.3 1706,222.9C1706,228.6 1705.9,229 1703.7,229C1700,229 1699.9,230 1703.2,234.8C1705.7,238.4 1706.4,240.6 1706.8,246C1707.3,254 1706,258.8 1701.7,263.6C1696.2,270 1688.2,272.1 1679.9,269.5ZM1692.3,256.9C1698.6,252 1697.7,239.7 1690.5,233C1688.4,231 1686.6,230.5 1680.8,230.2L1673.8,229.8L1674.2,239.6C1674.5,246.3 1675.2,250.5 1676.3,252.7C1679.5,258.8 1687.4,260.8 1692.3,256.9Z" style="fill-rule:nonzero;"/>
      <path d="M1639,199.1L1639,193.2L1651.6,188C1658.5,185.2 1668.3,181.3 1673.3,179.3C1678.4,177.4 1683.6,175.4 1685,174.8C1687.3,173.9 1686.3,173.3 1675,168.8C1668.1,166.1 1657.3,161.9 1651,159.5L1639.5,155.2L1639.2,149.1C1639,145.6 1639.3,143 1639.9,143C1641.3,143 1703.1,168.5 1713.5,173.4C1726.7,179.6 1732,186.6 1732,197.9L1732,202L1727,202C1722.3,202 1722,201.8 1722,199.5C1722,192.7 1716.9,186.7 1707.8,182.5L1702,179.9L1683.3,187.5C1672.9,191.8 1659.1,197.4 1652.5,200.1C1646,202.8 1640.2,205 1639.8,205C1639.4,205 1639,202.3 1639,199.1Z" style="fill-rule:nonzero;"/>
      <path d="M1372,433L1372,421L1451,421L1451,382L1462,382L1462,433L1372,433Z" style="fill-rule:nonzero;"/>
      <path d="M1416.3,367.5C1399.9,363 1391.1,348.5 1395.1,332.5C1396.5,327.1 1402.7,319.7 1408.2,316.9C1412.4,314.7 1427.7,312.3 1430.4,313.3C1431.8,313.9 1432,316.4 1432,335.5L1432,357L1434.8,357C1439.2,356.9 1445.5,353.5 1448.5,349.5C1453.8,342.7 1453,331.5 1446.8,324.4L1443.7,320.9L1446.1,318.2C1447.4,316.7 1448.8,315.1 1449.1,314.7C1450.1,313.4 1457.9,320.9 1460.2,325.4C1463.1,331.1 1463.8,342.2 1461.6,348.7C1459.7,354.4 1454.6,360.8 1449.5,364C1441.7,368.8 1427,370.4 1416.3,367.5ZM1422,341C1422,325.2 1422,325 1419.8,325C1416.5,325 1409.7,328.7 1407.6,331.7C1406.5,333.1 1405.5,336.4 1405.2,339C1404.6,345.8 1407,350.4 1413.4,354.1C1422.2,359.1 1422,359.4 1422,341Z" style="fill-rule:nonzero;"/>
      <path d="M1436.1,297.6C1425.9,294.2 1421.8,286.7 1421.2,269.8C1420.8,258.1 1420.7,258 1418.3,258C1414.6,258 1409.5,260.5 1407.2,263.5C1402.9,269 1405,282 1410.6,285.1C1413,286.3 1413.1,286.8 1412.5,291.5C1412.1,294.2 1411.6,296.6 1411.5,296.8C1410.9,297.5 1403.4,293.8 1401.2,291.7C1395.2,286.1 1392.5,274.2 1395,264C1396.6,257.2 1403.5,249.7 1409.5,248.2C1411.7,247.6 1424.4,247 1437.8,246.8L1462,246.5L1462,251.8C1462,256.9 1461.9,257 1459.1,257C1455.3,257 1454.5,258.3 1456.9,260.4C1458,261.4 1459.8,264.5 1461,267.3C1463.9,273.9 1463.4,282.8 1459.9,289C1455.5,296.7 1445.2,300.5 1436.1,297.6ZM1449.7,283.5C1454.1,278.4 1452.1,266 1446,260.5C1444.3,258.9 1442.4,258.5 1437.1,258.5L1430.5,258.5L1430.6,267.5C1430.7,277.7 1432.6,283.1 1436.9,285.6C1440.7,287.7 1447,286.7 1449.7,283.5Z" style="fill-rule:nonzero;"/>
      <path d="M1395,222L1395,211L1404.3,211L1400.2,206.6C1397.9,204.1 1395.8,200.9 1395.5,199.3C1395.1,197.8 1394.6,195.9 1394.4,195.1C1394.1,194.3 1394.2,191 1394.6,187.8L1395.3,181.9L1400.8,182.2L1406.4,182.5L1406.4,191.7C1406.5,201.6 1407.5,204.1 1413.4,208.4C1415.9,210.4 1417.7,210.5 1439.1,210.8L1462,211.1L1462,222L1395,222Z" style="fill-rule:nonzero;"/>
      <path d="M1395,164L1395,153L1402.1,153L1399.4,149.5C1389.5,136.5 1393.9,117.9 1407.8,114C1409.9,113.5 1422.5,113 1436.8,113L1462,113L1462,124L1438,124C1412.2,124 1410,124.4 1406.6,129.2C1404.6,132.1 1404.5,141.2 1406.5,144.9C1407.3,146.5 1409.3,148.9 1411,150.4L1414.2,153L1462,153L1462,164L1395,164Z" style="fill-rule:nonzero;"/>
    </g>
  </svg>`;

  const modalStyles = `
    <style id="results-modal-styles">
      #confetti-canvas {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 2000;
      }
      .modal-overlay {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(34, 34, 59, 0.9);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000; backdrop-filter: blur(8px);
        opacity: 0; animation: mo-fadeIn 0.4s ease forwards;
      }
      .modal-content {
        background: #F2E9E4; padding: 3.5rem;
        border-radius: 24px; text-align: center;
        max-width: 420px; width: 90%;
        border: 4px solid #22223B;
        box-shadow: 0 30px 60px rgba(0,0,0,0.5);
        transform: translateY(100vh);
        animation: mo-slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        animation-delay: 0.2s;
        font-family: "Roboto Mono", monospace;
        color: #22223B;
      }
      @keyframes mo-fadeIn { to { opacity: 1; } }
      @keyframes mo-slideUp { to { transform: translateY(0); } }
      @keyframes mo-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes mo-popIn { to { transform: scale(1); } }
      .score-circle {
        width: 140px; height: 140px; border-radius: 50%;
        border: 6px solid #22223B;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 1.5rem;
        font-size: 2.2rem; font-weight: bold;
        background: white;
        box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        animation: mo-pulse 2s infinite ease-in-out;
      }
      .modal-content h2 { margin-top: 0; font-size: 1.8rem; letter-spacing: -1px; }
      .modal-content p { font-size: 1.1rem; opacity: 0.9; }
      .loomlars-badge {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 12px; background: #22223B; color: #F2E9E4;
        padding: 10px 24px; border-radius: 30px; margin-top: 1.5rem;
        font-weight: bold; font-size: 1.1rem;
        transform: scale(0);
        animation: mo-popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        animation-delay: 0.8s;
      }
      .loomlar-icon-svg { width: 40px; height: 40px; }
      .loomlar-icon-svg path { fill: #F2E9E4 !important; }
      .close-btn {
        margin-top: 2rem; padding: 12px 28px;
        background: #22223B; color: #F2E9E4;
        border: none; font-family: "Roboto Mono", monospace;
        font-weight: bold; cursor: pointer;
        border-radius: 8px; transition: all 0.3s;
        box-shadow: 0 4px 0px #000;
      }
      .close-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 0px #000; }
      .close-btn:active { transform: translateY(2px); box-shadow: 0 0px 0px #000; }
    </style>`;

  document.head.insertAdjacentHTML('beforeend', modalStyles);

  const modalHTML = `
    <canvas id="confetti-canvas"></canvas>
    <div class="modal-overlay">
      <div class="modal-content">
        <h2>${headline}</h2>
        <div class="score-circle">${pct}%</div>
        <p>You correctly answered<br><strong>${correct_answers} out of ${total}</strong> questions.</p>
        <div class="loomlars-badge">
          ${loomlarEarned > 0 ? loomlarSVG : ''}
          <span style="color:var(--light);">${badgeText}</span>
        </div>
        <br>
        <a href="/dashboard"><button class="close-btn">Back to Home</button></a>
      </div>
    </div>`;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = modalHTML;
  document.body.appendChild(wrapper);

  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class Particle {
    constructor() {
      this.x            = Math.random() * canvas.width;
      this.y            = canvas.height + Math.random() * 100;
      this.size         = Math.random() * 8 + 4;
      this.color        = ['#F2E9E4', '#4A4E69', '#9A8C98', '#C9ADA7'][Math.floor(Math.random() * 4)];
      this.speedY       = Math.random() * -15 - 10;
      this.speedX       = Math.random() * 6 - 3;
      this.gravity      = 0.3;
      this.rotation     = Math.random() * 360;
      this.rotationSpeed = Math.random() * 10 - 5;
    }
    update() {
      this.y        += this.speedY;
      this.x        += this.speedX;
      this.speedY   += this.gravity;
      this.rotation += this.rotationSpeed;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation * Math.PI / 180);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      ctx.restore();
    }
  }

  function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p, i) => {
      p.update();
      p.draw();
      if (p.y > canvas.height + 20) particles.splice(i, 1);
    });
    requestAnimationFrame(animateConfetti);
  }

  animateConfetti();
  setTimeout(() => {
    for (let i = 0; i < 150; i++) {
      setTimeout(() => particles.push(new Particle()), i * 2);
    }
  }, 500);
}

// ════════════════════════════════════════════════════════
//  getWord  — branches to /api/generate-custom when the
//  user has custom words that haven't all been excluded
// ════════════════════════════════════════════════════════
async function getWord(interests) {
  const allExcluded = [...new Set([...exclude_words, ...known_words])];

  // ── NEW: filter custom_words against excluded list ──
  const availableCustomWords = custom_words.filter(
    w => !allExcluded.includes(w.toLowerCase())
  );

  // ── NEW: if the user has custom words to practice, use them ──
  if (availableCustomWords.length > 0) {
    console.log(`Using custom words mode (${availableCustomWords.length} available)`);

    const response = await fetch("/api/generate-custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        custom_words:  availableCustomWords,
        exclude_words: allExcluded,
        interests,
      })
    });

    if (!response.ok) throw new Error("Failed to generate custom lesson");

    data = await response.json();
    return data;
  }

  // ── Original flow: level-based generation ──
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interests, level, exclude_words: allExcluded })
  });

  if (!response.ok) throw new Error("Failed to generate words");

  data = await response.json();
  return data;
}