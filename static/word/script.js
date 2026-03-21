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

const today = new Date().toISOString().slice(0, 10);

let exclude_words = ["awkward", "consequently", "perspicacious"];
let level = "B2";

let quiz_index = 0;
let word_index = 0;
let data;

// Main Initialization
getWord(5).then(() => {
  setWord();
});

// Listeners
for (let i = 0; i < options_container.length; i++) {
  options_container[i].addEventListener('click', () => {
    // Ignore clicks if already answered
    if (document.querySelector('.answered')) return;

    const selected_option = document.querySelector('.selected_option');
    if (selected_option) selected_option.classList.remove('selected_option');
    options_container[i].classList.add('selected_option');

    // Check against the answer for the current quiz question
    const content = JSON.parse(data.choices[0].message.content).quiz[quiz_index];
    const correctIndex = content.answer;

    // Lock all options from further clicks
    options_container.forEach(opt => opt.classList.add('answered'));

    if (i === correctIndex) {
      options_container[i].classList.add('correct');
    } else {
      options_container[i].classList.add('incorrect');
      options_container[correctIndex].classList.add('selected_option');
      options_container[correctIndex].classList.add('correct'); // reveal correct
    }

    quiz_next_button.classList.remove('disabled');
  });
}

quiz_next_button.addEventListener('click', () => {
  if (quiz_index < 4) {
    quiz_index++;
    setQuiz();
  } else {
    alert("All 5 questions done!")
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
  // sentence_next_button.classList.add('disabled');
  sentence.style.right = "100%"
  if (word_index != 4) {
    word_index++;
    setWord();
  } else {
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
  const targetWord = word.textContent; // Gets the current word on the screen

  if (!userSentence) {
    alert("Please write a sentence first!");
    return;
  }

  // 1. Lock the input and show the loading animation
  input.readOnly = true;
  check_button.classList.add('disabled');
  explanation.innerHTML = '<svg width=1em xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><radialGradient id="a12" cx=".66" fx=".66" cy=".3125" fy=".3125" gradientTransform="scale(1.5)"><stop offset="0" stop-color="#F2E9E4"></stop><stop offset=".3" stop-color="#F2E9E4" stop-opacity=".9"></stop><stop offset=".6" stop-color="#F2E9E4" stop-opacity=".6"></stop><stop offset=".8" stop-color="#F2E9E4" stop-opacity=".3"></stop><stop offset="1" stop-color="#F2E9E4" stop-opacity="0"></stop></radialGradient><circle transform-origin="center" fill="none" stroke="url(#a12)" stroke-width="30" stroke-linecap="round" stroke-dasharray="200 1000" stroke-dashoffset="0" cx="100" cy="100" r="70"><animateTransform type="rotate" attributeName="transform" calcMode="spline" dur="2" values="360;0" keyTimes="0;1" keySplines="0 0 1 1" repeatCount="indefinite"></animateTransform></circle><circle transform-origin="center" fill="none" opacity=".2" stroke="#F2E9E4" stroke-width="30" stroke-linecap="round" cx="100" cy="100" r="70"></circle></svg>';
  explanation.hidden = false;

  // 2. Call our new check function
  checkSentence(userSentence, targetWord).then((result) => {
    // 3. Format the response nicely based on if they got it right or wrong
    if (result.correct) {
      explanation.innerHTML = `<span style="color: #4CAF50;">✅ <strong>Great job!</strong></span><br><br>${result.explanation}`;
      sentence_next_button.classList.remove('disabled');
    } else {
      explanation.innerHTML = `<span style="color: #F44336;">❌ <strong>Not quite right.</strong></span><br><br>${result.explanation}`;
      // Optional: Unlock the input so they can try again if they get it wrong
      input.readOnly = false;
      check_button.classList.remove('disabled');
    }
  });
});

main_next_button.addEventListener('click', () => {
  sentence.style.right = "0%"
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
  let temp_data = data;
  getWord(1).then(() => {
    data = {
      "choices": [
        {
          "message": {
            "content": `{ "words": ${JSON.stringify((JSON.parse(temp_data.choices[0].message.content).words).toSpliced(word_index, 1, JSON.parse(data.choices[0].message.content).words[0]))} }`
          }
        }
      ]
    }
    setWord();
  });
});

// Functions
async function checkSentence(userSentence, targetWord) {
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        sentence: userSentence, 
        word: targetWord 
      })
    });
    
    if (!response.ok) throw new Error("Server Error");
    
    const data = await response.json();
    
    // The AI returns the JSON as a string inside the content property, so we parse it
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

  // Clear all answer state for the new question
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

// async function getWord(amount) {
//   try {
//     const response = await fetch("/api/generate", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       // Pass the parameters to the Flask backend
//       body: JSON.stringify({
//         amount: amount,
//         level: level,
//         exclude_words: exclude_words
//       })
//     });
  
//     if (!response.ok) throw new Error("Server Error");

//     data = await response.json();
//     return data;
//   } catch (error) {
//     console.error("Failed to fetch words:", error);
//     // window.location.reload(true); // Re-enable if you want it to force reload on fail
//   }
// }

async function getWord(amount) {
  data = 
{
    "choices": [
        {
            "finish_reason": "stop",
            "index": 0,
            "message": {
                "content": "{\n  \"words\": [\n    {\n      \"word\": \"Bureaucratic\",\n      \"word_form\": \"adjective\",\n      \"phonetic\": \"/byʊroʊˈkrætɪk/\",\n      \"vietnamese_translation\": \"người hành chính\",\n      \"definition\": \"relating to the habits and practices of people who work in government offices, especially in a way that is slow and inefficient\",\n      \"example\": \"The bureaucratic process took several months to complete.\",\n      \"synonyms\": [\"administrative\", \"official\", \"red-tape\"]\n    },\n    {\n      \"word\": \"Meritorious\",\n      \"word_form\": \"adjective\",\n      \"phonetic\": \"/məˈrɪtɔriəs/\",\n      \"vietnamese_translation\": \"có giá trị\",\n      \"definition\": \"deserving praise or reward because of a notable achievement or service\",\n      \"example\": \"The meritorious work of the scientists led to a major breakthrough.\",\n      \"synonyms\": [\"deserving\", \"commendable\", \"notable\"]\n    },\n    {\n      \"word\": \"Metamorphosis\",\n      \"word_form\": \"noun\",\n      \"phonetic\": \"/ˌmɛtəˈmɒrfəsɪs/\",\n      \"vietnamese_translation\": \"phá vỡ hình dạng\",\n      \"definition\": \"a complete change in the form of something or someone, especially so that it becomes completely different\",\n      \"example\": \"The caterpillar's metamorphosis into a beautiful butterfly was a wonder to behold.\",\n      \"synonyms\": [\"transformation\", \"change\", \"mutation\"]\n    },\n    {\n      \"word\": \"Fastidious\",\n      \"word_form\": \"adjective\",\n      \"phonetic\": \"/ˌfæsˈtɪdiəs/\",\n      \"vietnamese_translation\": \"sắt, chu đáo\",\n      \"definition\": \"extremely careful and demanding in one's standards, especially in relation to cleanliness or detail\",\n      \"example\": \"The chef was a fastidious perfectionist, ensuring that every dish was prepared to precise standards.\",\n      \"synonyms\": [\"meticulous\", \"fussy\", \"exact\"]\n    },\n    {\n      \"word\": \"Enigmatic\",\n      \"word_form\": \"adjective\",\n      \"phonetic\": \"/ɛˈnɪɡmætɪk/\",\n      \"vietnamese_translation\": \"có vẻ ẩn mật\",\n      \"definition\": \"difficult to understand or interpret because of unclear or ambiguous language, behavior, or character\",\n      \"example\": \"The enigmatic smile of the Mona Lisa has fascinated art lovers for centuries.\",\n      \"synonyms\": [\"mysterious\", \"cryptic\", \"obscure\"]\n    }\n  ],\n  \"quiz\": [\n    {\n      \"question\": \"Which word describes someone or something that is difficult to understand?\",\n      \"options\": [\"Fastidious\", \"Enigmatic\", \"Metamorphosis\", \"Bureaucratic\"],\n      \"answer\": 3\n    },\n    {\n      \"question\": \"What is another word for 'deserving praise or reward'?\",\n      \"options\": [\"Meritorious\", \"Fastidious\", \"Bureaucratic\", \"Enigmatic\"],\n      \"answer\": 0\n    },\n    {\n      \"question\": \"Which word describes a 'big change'?\",\n      \"options\": [\"Metamorphosis\", \"Fastidious\", \"Meritorious\", \"Enigmatic\"],\n      \"answer\": 0\n    },\n    {\n      \"question\": \"Which adjective describes someone who is extremely careful and demanding in their standards?\",\n      \"options\": [\"Fastidious\", \"Enigmatic\", \"Bureaucratic\", \"Meritorious\"],\n      \"answer\": 0\n    },\n    {\n      \"question\": \"What does the word 'bureaucratic' primarily relate to?\",\n      \"options\": [\"people who work in government offices\", \"official documents\", \"red tape\", \"corporate business\"],\n      \"answer\": 0\n    }\n  ]\n}",
                "role": "assistant"
            }
        }
    ]
}

  return data
}