document.getElementById('uploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    const response = await fetch('http://localhost:3000/api/diagnose', {
        method: 'POST',
        body: formData,
    });
    const result = await response.json();
    document.getElementById('disease').textContent = `Disease: ${result.disease}`;
    document.getElementById('confidence').textContent = `Confidence: ${result.confidence}%`;
});
