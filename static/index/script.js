const input = document.getElementById('input');
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function runAnimation() {
    const firstWord = "vocabulary";
    const finalPhrase = "vocab made simple";

    // 1. Type "vocabulary"
    for (let i = 0; i <= firstWord.length; i++) {
        input.value = firstWord.slice(0, i);
        await delay(150);
    }

    await delay(500);

    // 2. Backspace until "vocab"
    for (let i = firstWord.length; i >= 5; i--) {
        input.value = firstWord.slice(0, i);
        await delay(100);
    }

    await delay(500);

    // 3. Type " made simple"
    const remainingPart = finalPhrase.slice(5);
    for (let i = 1; i <= remainingPart.length; i++) {
        input.value = "vocab" + remainingPart.slice(0, i);
        await delay(50);
    }

}

runAnimation();