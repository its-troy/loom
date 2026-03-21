document.addEventListener('DOMContentLoaded', () => {
    const inputEle = document.getElementById('input');
    const caretEle = document.getElementById('caret');

    inputEle.focus();

    // 1. Get styles once
    const style = window.getComputedStyle(inputEle);
    const paddingLeft = parseFloat(style.paddingLeft);

    // 2. Measure a single character width
    // We create a temporary span to see how wide 'A' is in this specific font
    const measure = document.createElement('span');
    measure.style.font = style.font;
    measure.style.visibility = 'hidden';
    measure.style.position = 'absolute';
    measure.style.whiteSpace = 'pre';
    measure.textContent = 'A';
    document.body.appendChild(measure);

    const charWidth = measure.getBoundingClientRect().width;
    document.body.removeChild(measure);

    // 3. Optimized listener
    inputEle.addEventListener(['selectionchange'], () => {
        textWidth = (2 * inputEle.selectionEnd - inputEle.value.length) * charWidth - paddingLeft;

        // Use requestAnimationFrame for a silky smooth 60fps update
        requestAnimationFrame(() => {
            caretEle.style.translate = `${textWidth / 2}px`;
        });
    });

    inputEle.addEventListener(['blur'], () => {
        inputEle.focus();
    });
});