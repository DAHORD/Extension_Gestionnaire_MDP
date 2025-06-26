chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fill_credentials") {
        const { username, password } = request.data;
        
        // Logique très simple pour trouver les champs
        // Une vraie extension aurait une logique beaucoup plus complexe
        const usernameField = document.querySelector('input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="login"]');
        const passwordField = document.querySelector('input[type="password"]');

        if (usernameField && password) {
            usernameField.value = username;
        }
        if (passwordField && password) {
            passwordField.value = password;
        }
    }
});