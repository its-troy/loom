const form = document.getElementById('multi-step-form');
const questionText = document.getElementById('question_text');
const inputField = document.getElementById('input');
const hiddenSkill = document.getElementById('hidden_skill');
const hiddenInterests = document.getElementById('hidden_interests');

let currentStep = 1;

inputField.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Stop the form from submitting normally

        const value = inputField.value.trim();
        if (value === "") return; // Don't proceed if empty

        if (currentStep === 1) {
            // 1. Save the first answer
            hiddenSkill.value = value;
            
            // 2. Transition to Step 2
            questionText.innerText = "What are your interests?";
            inputField.value = ""; // Clear input for next question
            inputField.placeholder = "Coding, Music, Art...";
            
            currentStep = 2;
        } else if (currentStep === 2) {
            // 1. Save the second answer
            hiddenInterests.value = value;
            
            // 2. Final Submit
            console.log("Form Ready to Submit:", hiddenSkill.value, hiddenInterests.value);
            form.submit(); 
        }
    }
});