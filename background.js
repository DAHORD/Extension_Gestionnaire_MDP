// ATTENTION : Le mot de passe maître est stocké en mémoire dans le service worker.
// C'est plus sûr que le sessionStorage, mais il est effacé quand Chrome ferme le service worker.
let masterPassword = null;
const LOCK_ALARM_NAME = 'vault-lock-alarm';

// Fonction pour verrouiller le coffre-fort
function lockVault() {
  masterPassword = null;
  console.log('ModernVault a été verrouillé.');
  chrome.alarms.clear(LOCK_ALARM_NAME); // Efface le minuteur
}

// Fonction pour déverrouiller et démarrer le minuteur
function unlockVault(password) {
  masterPassword = password;
  console.log('ModernVault déverrouillé.');
  chrome.alarms.create(LOCK_ALARM_NAME, { delayInMinutes: 15 });
  chrome.action.setIcon({ path: "icons/icon128.png" }); // Icône normale
}

// Écouteur pour le minuteur
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM_NAME) {
    lockVault();
  }
});

// Écouteur pour les messages venant du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setMasterPassword') {
    unlockVault(request.password);
    sendResponse({ success: true });
  } else if (request.action === 'getMasterPassword') {
    if (masterPassword) {
      // Réinitialise le minuteur à chaque action
      chrome.alarms.create(LOCK_ALARM_NAME, { delayInMinutes: 20 });
    }
    sendResponse({ password: masterPassword });
  } else if (request.action === 'lock') {
    lockVault();
    sendResponse({ success: true });
  }
  return true; // Indique une réponse asynchrone
});