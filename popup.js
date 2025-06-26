document.addEventListener('DOMContentLoaded', () => {
    // --- ÉTAT ---
    let currentHost = '';
    let masterPassword = null;
    let editingCredentialId = null;
    let detectedCredentials = null;

    // --- RÉFÉRENCES VUES & ÉLÉMENTS ---
    const views = {
        lock: document.getElementById('lock-view'),
        main: document.getElementById('main-view'),
        edit: document.getElementById('edit-view'),
        generator: document.getElementById('generator-view'),
        settings: document.getElementById('settings-view')
    };
    const masterPasswordInput = document.getElementById('master-password-input');
    const unlockButton = document.getElementById('unlock-button');
    const lockStatus = document.getElementById('lock-status');
    const credentialsList = document.getElementById('credentials-list');
    const searchInput = document.getElementById('search-input');
    const lockNowButton = document.getElementById('lock-now-button');
    const settingsButton = document.getElementById('settings-button');
    const settingsStatus = document.getElementById('settings-status');
    const suggestionBanner = document.getElementById('suggestion-banner');
    const addSuggestedButton = document.getElementById('add-suggested-button');
    const typePasswordRadio = document.getElementById('type-password');
    const typePassphraseRadio = document.getElementById('type-passphrase');
    const passwordOptionsDiv = document.getElementById('password-options');
    const lengthLabelContainer = document.getElementById('length-label-container');
    const WORD_LIST = [
        "arbre", "bleu", "chat", "chien", "école", "fleur", "soleil", "lune",
        "maison", "nuage", "oiseau", "pluie", "route", "vert", "vent", "ami",
        "livre", "musique", "nuit", "jour", "voyage", "rire", "silence", "étoile",
        "montagne", "rivière", "forêt", "campagne", "ville", "mer", "ciel", "terre",
        "pomme", "banane", "orange", "citron", "cerise", "fraise", "poire", "raisin",
        "café", "thé", "eau", "lait", "pain", "riz", "pâtes", "viande", "poisson",
        "voiture", "vélo", "train", "avion", "bateau", "bus", "moto", "pied",
        "chaise", "table", "lit", "fenêtre", "porte", "mur", "plafond", "sol",
        "ordinateur", "téléphone", "clavier", "souris", "écran", "imprimante", "hautparleur", "micro"
    ];
    const editNameInput = document.getElementById('edit-name');
    const editSiteInput = document.getElementById('edit-site');
    const editUsernameInput = document.getElementById('edit-username');
    const editPasswordInput = document.getElementById('edit-password');
    const editNotesInput = document.getElementById('edit-notes');
    const EYE_OPEN_PATH = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z';
    const EYE_CLOSED_PATH = 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm-9.35-7.79c1.73-4.39 6-7.5 11-7.5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5s-9.27-3.11-11-7.5c1.73-4.39 6-7.5 11-7.5zM2 4.27l2.28 2.28L12 14.88l7.72-7.72L22 4.27 19.73 2l-7.73 7.73L4.27 2 2 4.27z';

    // --- GESTION DES VUES ---
    function showView(viewName) {
        Object.values(views).forEach(v => v.classList.add('hidden'));
        views[viewName].classList.remove('hidden');
    }

    // --- INITIALISATION ---
    async function init() {
        const response = await chrome.runtime.sendMessage({ action: 'getMasterPassword' });
        masterPassword = response.password;
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            try {
                currentHost = new URL(tab.url).hostname;
            } catch (e) {
                console.error("Invalid URL:", tab.url, e);
                currentHost = ''; // Gérer les URLs invalides
            }
        }

        if (masterPassword) {
            showView('main');
            await migrateOldDataIfNecessary(); // NEW: Run migration first
            await loadCredentials();
            await checkAndSuggestCredentials(); // Appel de la fonction de suggestion
        } else {
            showView('lock');
        }
    }
    
    // --- AUTHENTIFICATION ---
    unlockButton.addEventListener('click', async () => {
        const password = masterPasswordInput.value;
        if (!password) {
            lockStatus.textContent = 'Veuillez entrer un mot de passe.';
            return;
        }

        const data = await chrome.storage.local.get('check');
        if (data.check) {
            const decrypted = await decryptData(password, data.check);
            if (decrypted === 'ok') {
                await chrome.runtime.sendMessage({ action: 'setMasterPassword', password });
                masterPassword = password;
                masterPasswordInput.value = '';
                lockStatus.textContent = ''; // Clear status on success
                showView('main');
                await migrateOldDataIfNecessary(); // NEW: Run migration after unlock
                await loadCredentials();
                await checkAndSuggestCredentials(); // Vérifier et suggérer après déverrouillage
            } else {
                lockStatus.textContent = 'Mot de passe maître incorrect.';
            }
        } else {
            // First time setup
            const encryptedCheck = await encryptData(password, 'ok');
            await chrome.storage.local.set({ check: encryptedCheck });
            await chrome.runtime.sendMessage({ action: 'setMasterPassword', password });
            masterPassword = password;
            masterPasswordInput.value = '';
            lockStatus.textContent = ''; // Clear status on success
            showView('main');
            await migrateOldDataIfNecessary(); // NEW: Run migration after setup (should be empty but good practice)
            await loadCredentials();
            await checkAndSuggestCredentials(); // Vérifier et suggérer après configuration
        }
    });
    
    lockNowButton.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'lock' });
        masterPassword = null;
        detectedCredentials = null; // Clear detected credentials on lock
        suggestionBanner.classList.add('hidden'); // Hide suggestion banner
        showView('lock');
        masterPasswordInput.value = ''; // Clear input on lock
    });

    // --- GESTION DES IDENTIFIANTS ---
    async function loadCredentials(filter = '') {
        const data = await chrome.storage.local.get(null);
        credentialsList.innerHTML = '';
        const template = document.getElementById('credential-item-template');
        
        let allCredentials = [];
        for (const uuid in data) {
            if (uuid === 'check' || uuid === 'migrated') continue; // Skip master password check hash and migration flag

            const encryptedItem = data[uuid];
            const decryptedItem = await decryptData(masterPassword, encryptedItem);
            if (!decryptedItem) {
                console.warn(`Could not decrypt item with key: ${uuid}. Skipping.`);
                continue;
            }
            
            try {
                const credentials = JSON.parse(decryptedItem);
                // Ensure required fields exist, default to empty string if not
                credentials.id = uuid; // Attach the UUID from the storage key
                credentials.name = credentials.name || credentials.site || 'Sans nom'; 
                credentials.notes = credentials.notes || ''; 
                credentials.username = credentials.username || '';
                credentials.password = credentials.password || '';

                // Ensure site property exists (for migrated old entries)
                if (!credentials.site) {
                    // This should ideally not happen if migration works correctly,
                    // but as a fallback, assume the key itself was the site for old entries.
                    // However, with UUIDs, the key is no longer the site.
                    // This implies issues if 'site' property wasn't saved correctly during migration.
                    // For robustness, ensure migration correctly sets 'site' property.
                    console.error(`Credential with ID ${uuid} has no 'site' property.`);
                    continue; 
                }

                allCredentials.push(credentials);
            } catch (e) {
                console.error(`Error parsing JSON for item with key ${uuid}:`, e);
            }
        }

        // Sort: current host first, then alphabetically by name, then by site
        allCredentials.sort((a, b) => {
            const isACurrentHost = a.site === currentHost;
            const isBCurrentHost = b.site === currentHost;

            if (isACurrentHost && !isBCurrentHost) return -1;
            if (!isACurrentHost && isBCurrentHost) return 1;
            
            // If both are current host or neither are, sort by name
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;

            // If names are the same, sort by site
            const siteA = a.site.toLowerCase();
            const siteB = b.site.toLowerCase();
            if (siteA < siteB) return -1;
            if (siteA > siteB) return 1;

            return 0; // Maintain original order if all equal
        });

        for (const credentials of allCredentials) {
            const itemName = credentials.name; // Use the stored name
            const siteToDisplay = credentials.site;
            
            // Filter logic
            if (filter && 
                !(itemName && itemName.toLowerCase().includes(filter.toLowerCase())) && // Check if name exists before using it
                !(siteToDisplay && siteToDisplay.toLowerCase().includes(filter.toLowerCase())) && // Check if site exists
                !(credentials.username && credentials.username.toLowerCase().includes(filter.toLowerCase())) // Check if username exists
            ) {
                continue;
            }

            const clone = template.content.cloneNode(true);
            const listItem = clone.querySelector('.list-item');
            listItem.dataset.id = credentials.id; // Set data-id for later reference
            
            // Favicon logic
            const faviconImg = clone.querySelector('.item-favicon');
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${credentials.site}&sz=32`; // Google Favicon service
            faviconImg.src = faviconUrl;
            faviconImg.onerror = function() {
                this.style.display = 'none'; // Hide the broken image icon
            };


            clone.querySelector('.item-name').textContent = itemName; 
            clone.querySelector('.item-username').textContent = credentials.username;
            clone.querySelector('.item-site').textContent = siteToDisplay; // Affiche toujours le site web
            
            if (credentials.site === currentHost) {
                 listItem.classList.add('current-host'); // Add class for styling
            }
            
            // Event listeners
            clone.querySelector('.copy-password').addEventListener('click', () => copyPassword(credentials.id));
            clone.querySelector('.fill-credential').addEventListener('click', () => fillCredential(credentials.id));
            clone.querySelector('.edit-credential').addEventListener('click', () => startEdit(credentials.id));
            clone.querySelector('.delete-credential').addEventListener('click', () => deleteCredential(credentials.id));

            credentialsList.appendChild(clone);
        }
    }

    searchInput.addEventListener('input', (e) => loadCredentials(e.target.value));
    
    async function getCredentialById(id) {
        const data = await chrome.storage.local.get(id);
        if (data[id]) {
            const decrypted = await decryptData(masterPassword, data[id]);
            if (decrypted) {
                return JSON.parse(decrypted);
            }
        }
        return null;
    }

    async function copyPassword(credentialId) {
        const credentials = await getCredentialById(credentialId);
        if (credentials) {
            await navigator.clipboard.writeText(credentials.password);
            showTemporaryStatus('Mot de passe copié !', 'success', 3000);
            // Clear clipboard after 10 seconds for security (Bitwarden-like)
            setTimeout(() => {
                navigator.clipboard.writeText(''); 
                console.log('Presse-papier vidé.');
            }, 10000); 
        }
    }
    
    async function fillCredential(credentialId) {
        const credentials = await getCredentialById(credentialId);
        if (credentials) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (creds) => {
                        const userFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"], input[type="text"][name*="user"], input[type="text"][name*="login"], input[id*="username"], input[id*="login"]');
                        const passFields = document.querySelectorAll('input[type="password"]');

                        // Try to fill the first visible/active fields
                        if (userFields.length > 0) userFields[0].value = creds.username;
                        if (passFields.length > 0) passFields[0].value = creds.password;

                        // Trigger input event to simulate user typing (for some frameworks)
                        if (userFields.length > 0) userFields[0].dispatchEvent(new Event('input', { bubbles: true }));
                        if (passFields.length > 0) passFields[0].dispatchEvent(new Event('input', { bubbles: true }));
                    },
                    args: [credentials]
                });
                window.close(); // Close popup after filling
            } else {
                showTemporaryStatus('Impossible de remplir: onglet introuvable.', 'error');
            }
        } else {
            showTemporaryStatus('Identifiant non trouvé pour le remplissage.', 'error');
        }
    }
    
    async function startEdit(credentialId) {
        editingCredentialId = credentialId;
        const credentials = await getCredentialById(credentialId);
        if (credentials) {
            document.getElementById('edit-view-title').textContent = 'Modifier un identifiant';
            editNameInput.value = credentials.name || ''; 
            editSiteInput.value = credentials.site || '';
            editUsernameInput.value = credentials.username || '';
            editPasswordInput.value = credentials.password || '';
            editNotesInput.value = credentials.notes || ''; 
            document.getElementById('edit-status').textContent = ''; // Clear status
            showView('edit');
        } else {
            showTemporaryStatus('Identifiant introuvable pour la modification.', 'error');
        }
    }

    async function deleteCredential(credentialId) {
        const credentials = await getCredentialById(credentialId);
        if (!credentials) {
            showTemporaryStatus('Identifiant non trouvé pour la suppression.', 'error');
            return;
        }

        if (confirm(`Êtes-vous sûr de vouloir supprimer "${credentials.name}" pour "${credentials.site}" ?`)) {
            await chrome.storage.local.remove(credentialId);
            showTemporaryStatus('Identifiant supprimé.', 'success', 2000);
            await loadCredentials(searchInput.value);
        }
    }
    
    // --- AJOUT / MODIFICATION ---
    document.getElementById('add-new-button').addEventListener('click', () => {
        editingCredentialId = null; // Important for new entry
        document.getElementById('edit-view-title').textContent = 'Ajouter un identifiant';
        editNameInput.value = ''; 
        editSiteInput.value = currentHost; // Pré-rempli le site actuel
        editUsernameInput.value = '';
        editPasswordInput.value = '';
        editNotesInput.value = ''; 
        document.getElementById('edit-status').textContent = ''; // Clear previous status
        showView('edit');
    });

    // Handle adding suggested credentials
    addSuggestedButton.addEventListener('click', () => {
        if (detectedCredentials) {
            editingCredentialId = null; // Always a new entry when coming from suggestion banner
            document.getElementById('edit-view-title').textContent = 'Ajouter l\'identifiant suggéré';
            editNameInput.value = detectedCredentials.name || currentHost; // Use detected name or site
            editSiteInput.value = currentHost;
            editUsernameInput.value = detectedCredentials.username;
            editPasswordInput.value = detectedCredentials.password;
            editNotesInput.value = ''; 
            document.getElementById('edit-status').textContent = '';
            showView('edit');
        }
    });


    document.getElementById('cancel-edit-button').addEventListener('click', () => {
        showView('main');
        suggestionBanner.classList.add('hidden'); // Hide banner if coming from suggestion
        detectedCredentials = null; // Clear detected credentials
    });

    document.getElementById('save-credential-button').addEventListener('click', async () => {
        const name = editNameInput.value.trim(); 
        const site = editSiteInput.value.trim();
        const username = editUsernameInput.value.trim();
        const password = editPasswordInput.value;
        const notes = editNotesInput.value.trim(); 
        const statusEl = document.getElementById('edit-status');

        if (!name || !site || !username || !password) { 
            statusEl.textContent = 'Nom, Site, Nom d\'utilisateur et Mot de passe sont requis.';
            statusEl.style.color = '#dc3545';
            return;
        }

        const allStoredData = await chrome.storage.local.get(null);
        let existingCredentialWithSameNameAndSiteId = null;

        // Check for existing credential with the same site and name
        for (const uuid in allStoredData) {
            if (uuid === 'check' || uuid === 'migrated') continue;
            try {
                const storedCreds = JSON.parse(await decryptData(masterPassword, allStoredData[uuid]));
                // Ensure name and site exist and compare case-insensitively for user convenience
                if (storedCreds.site && storedCreds.site.toLowerCase() === site.toLowerCase() &&
                    storedCreds.name && storedCreds.name.toLowerCase() === name.toLowerCase()) {
                    
                    if (editingCredentialId !== uuid) { // Found a conflict with a *different* credential
                        existingCredentialWithSameNameAndSiteId = uuid;
                        break;
                    }
                }
            } catch (e) {
                console.error(`Error checking existing data for key ${uuid}:`, e);
            }
        }

        let idToSave = editingCredentialId;
        if (!idToSave) { // This is a new entry
            if (existingCredentialWithSameNameAndSiteId) {
                // Conflict found for a NEW entry
                if (!confirm(`Un identifiant existe déjà pour le site "${site}" avec le nom "${name}". Voulez-vous le remplacer ?`)) {
                    statusEl.textContent = 'Opération annulée.';
                    statusEl.style.color = '#ffc107'; 
                    return;
                }
                idToSave = existingCredentialWithSameNameAndSiteId; // Overwrite the existing one
            } else {
                idToSave = crypto.randomUUID(); // Generate new UUID
            }
        } else { // This is an edit
            if (existingCredentialWithSameNameAndSiteId && existingCredentialWithSameNameAndSiteId !== idToSave) {
                 // Conflict found for an EDIT that moves to an already existing (site, name) pair
                if (!confirm(`Un autre identifiant existe déjà pour le site "${site}" avec le nom "${name}". Voulez-vous fusionner/remplacer ?`)) {
                    statusEl.textContent = 'Opération annulée.';
                    statusEl.style.color = '#ffc107'; 
                    return;
                }
                // If user confirms, remove the conflicting one and update the current one
                await chrome.storage.local.remove(existingCredentialWithSameNameAndSiteId);
            }
        }

        // Prepare the credential object
        const credentialsToStore = { id: idToSave, name, site, username, password, notes };
        const encryptedCredentials = await encryptData(masterPassword, JSON.stringify(credentialsToStore));
        
        let dataToSave = {};
        dataToSave[idToSave] = encryptedCredentials;
        
        await chrome.storage.local.set(dataToSave);
        
        editingCredentialId = null;
        detectedCredentials = null; // Clear detected credentials after saving
        suggestionBanner.classList.add('hidden'); // Hide banner after saving
        statusEl.textContent = ''; // Clear status on success
        showView('main');
        await loadCredentials();
        showTemporaryStatus('Identifiant enregistré !', 'success', 2000);
    });

    // --- GÉNÉRATEUR DE MOTS DE PASSE ---
    const generatedPasswordField = document.getElementById('generated-password');
    const lengthSlider = document.getElementById('length-slider');
    const lengthLabel = document.getElementById('length-label');
    const regenerateButton = document.getElementById('regenerate-button');
    const backFromGeneratorButton = document.getElementById('back-from-generator-button');
    const showGeneratorButton = document.getElementById('show-generator-button');
    showGeneratorButton.addEventListener('click', () => {
        showView('generator');
        generatePassword();
    });
    backFromGeneratorButton.addEventListener('click', () => showView('main'));
    regenerateButton.addEventListener('click', generatePassword);
    lengthSlider.addEventListener('input', (e) => {
        lengthLabel.textContent = e.target.value;
        generatePassword(); // Regenerate on length change
    });
    document.getElementById('include-uppercase').addEventListener('change', generatePassword);
    document.getElementById('include-numbers').addEventListener('change', generatePassword);
    document.getElementById('include-symbols').addEventListener('change', generatePassword);
    function generatePassword() {
        const length = parseInt(lengthSlider.value);
        const includeUppercase = document.getElementById('include-uppercase').checked;
        const includeNumbers = document.getElementById('include-numbers').checked;
        const includeSymbols = document.getElementById('include-symbols').checked;
        const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
        const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numberChars = '0123456789';
        const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        let charSet = lowerChars;
        if (includeUppercase) charSet += upperChars;
        if (includeNumbers) charSet += numberChars;
        if (includeSymbols) charSet += symbolChars;

        if (charSet.length === 0) { // Prevent infinite loop if no options are selected
            generatedPasswordField.value = 'Sélectionnez au moins un type de caractère.';
            return;
        }

        let password = '';
        // Ensure at least one char from each selected type
        if (includeUppercase) password += upperChars.charAt(Math.floor(Math.random() * upperChars.length));
        if (includeNumbers) password += numberChars.charAt(Math.floor(Math.random() * numberChars.length));
        if (includeSymbols) password += symbolChars.charAt(Math.floor(Math.random() * symbolChars.length));
        
        for (let i = password.length; i < length; i++) { // Fill remaining length
            password += charSet.charAt(Math.floor(Math.random() * charSet.length));
        }
        
        // Shuffle the password to ensure randomness of type placement
        password = password.split('').sort(() => Math.random() - 0.5).join('');

        generatedPasswordField.value = password;
    }

    document.getElementById('copy-generated-button').addEventListener('click', () => {
        navigator.clipboard.writeText(generatedPasswordField.value);
        showTemporaryStatus('Mot de passe généré copié !', 'success', 3000);
        setTimeout(() => {
            navigator.clipboard.writeText(''); 
            console.log('Presse-papier vidé.');
        }, 10000); 
    });


    // --- PARAMÈTRES ---
    settingsButton.addEventListener('click', () => {
        showView('settings');
        settingsStatus.textContent = ''; // Clear any previous status
    });
    document.getElementById('back-from-settings-button').addEventListener('click', () => {
        showView('main');
    });

    // Change Master Password
    document.getElementById('change-master-password-button').addEventListener('click', async () => {
        const oldMasterPassword = prompt('Entrez votre mot de passe maître actuel :');
        if (oldMasterPassword !== masterPassword) {
            showTemporaryStatus('Mot de passe maître actuel incorrect.', 'error', 3000, 'settings-status');
            return;
        }
        const newMasterPassword = prompt('Entrez votre nouveau mot de passe maître :');
        if (newMasterPassword) {
            const confirmNewMasterPassword = prompt('Confirmez votre nouveau mot de passe maître :');
            if (newMasterPassword !== confirmNewMasterPassword) {
                showTemporaryStatus('Les mots de passe ne correspondent pas.', 'error', 3000, 'settings-status');
                return;
            }

            // Re-encrypt all existing data with new master password
            const allData = await chrome.storage.local.get(null);
            let newData = {};
            let reEncryptedCount = 0;
            let errors = 0;

            for (const key in allData) {
                if (key === 'check') {
                    newData[key] = await encryptData(newMasterPassword, 'ok');
                } else if (key === 'migrated') {
                    newData[key] = allData[key]; // Keep the migration flag as is
                } else {
                    try {
                        const decrypted = await decryptData(masterPassword, allData[key]);
                        if (decrypted) {
                            newData[key] = await encryptData(newMasterPassword, decrypted);
                            reEncryptedCount++;
                        } else {
                            console.error(`Failed to decrypt ${key}, skipping re-encryption.`);
                            errors++;
                        }
                    } catch (e) {
                        console.error(`Error processing ${key}:`, e);
                        errors++;
                    }
                }
            }

            // Clear old data and save new
            await chrome.storage.local.clear(); 
            await chrome.storage.local.set(newData); 
            await chrome.runtime.sendMessage({ action: 'setMasterPassword', password: newMasterPassword });
            masterPassword = newMasterPassword; // Update in current session

            if (errors === 0) {
                showTemporaryStatus(`Mot de passe maître changé avec succès ! ${reEncryptedCount} identifiants mis à jour.`, 'success', 5000, 'settings-status');
            } else {
                showTemporaryStatus(`Mot de passe maître changé, mais des erreurs ont eu lieu pour ${errors} identifiants.`, 'warning', 7000, 'settings-status');
            }
        }
    });

    // Export Vault
    document.getElementById('export-vault-button').addEventListener('click', async () => {
        if (!masterPassword) {
            showTemporaryStatus('Veuillez déverrouiller le coffre-fort d\'abord.', 'error', 3000, 'settings-status');
            return;
        }

        const dataToExport = await chrome.storage.local.get(null);
        // We export the encrypted data as is, the master password is NOT part of the export.
        // This means the user needs their master password to decrypt it upon import.
        
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: 'modernvault_backup.json',
            saveAs: true
        }).then(() => {
            showTemporaryStatus('Coffre-fort exporté avec succès !', 'success', 3000, 'settings-status');
        }).catch(error => {
            showTemporaryStatus('Erreur lors de l\'exportation.', 'error', 3000, 'settings-status');
            console.error('Download failed:', error);
        });
    });

    // Import Vault
    const importVaultInput = document.getElementById('import-vault-input');
    document.getElementById('import-vault-button').addEventListener('click', () => {
        importVaultInput.click(); // Trigger the hidden file input
    });

    importVaultInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                // Ask for master password to re-encrypt imported data if it's in the old format
                const currentMasterPass = prompt('Entrez votre mot de passe maître actuel pour importer les données :');
                if (!currentMasterPass) {
                    showTemporaryStatus('Opération annulée.', 'error', 2000, 'settings-status');
                    return;
                }

                // Verify the master password against the 'check' entry in the imported data
                const importedCheckEncrypted = importedData.check;
                if (!importedCheckEncrypted) {
                    showTemporaryStatus('Fichier de sauvegarde invalide (manque la clé de vérification).', 'error', 5000, 'settings-status');
                    return;
                }
                const decryptedCheck = await decryptData(currentMasterPass, importedCheckEncrypted);
                if (decryptedCheck !== 'ok') {
                    showTemporaryStatus('Mot de passe maître incorrect pour les données importées.', 'error', 5000, 'settings-status');
                    return;
                }

                // Temporary storage for processing
                let processedData = {};
                let requiresMigration = false;

                for (const key in importedData) {
                    if (key === 'check' || key === 'migrated') {
                        processedData[key] = importedData[key];
                        continue;
                    }

                    // Check if it's an old-style entry (looks like a hostname)
                    // Simple heuristic: if it doesn't look like a UUID, assume it's old
                    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
                        requiresMigration = true;
                        // For import, we decrypt with the provided masterPass, then re-encrypt with the _current_ masterPass (masterPassword)
                        try {
                            const decryptedOld = await decryptData(currentMasterPass, importedData[key]);
                            if (decryptedOld) {
                                const oldCreds = JSON.parse(decryptedOld);
                                const newId = crypto.randomUUID();
                                const newCreds = {
                                    id: newId,
                                    site: key, // old key was the site
                                    name: oldCreds.name || key, // Use old name or fallback to site
                                    username: oldCreds.username,
                                    password: oldCreds.password,
                                    notes: oldCreds.notes || ''
                                };
                                processedData[newId] = await encryptData(masterPassword, JSON.stringify(newCreds));
                            } else {
                                throw new Error(`Failed to decrypt old format data for key: ${key}`);
                            }
                        } catch (decryptError) {
                            console.error("Error decrypting old format imported data:", decryptError);
                            showTemporaryStatus(`Erreur de décryptage des anciennes données pour ${key}.`, 'error', 5000, 'settings-status');
                            return;
                        }
                    } else {
                        // It's already in new format, just re-encrypt with current masterPassword
                        try {
                            const decryptedExisting = await decryptData(currentMasterPass, importedData[key]);
                            if (decryptedExisting) {
                                processedData[key] = await encryptData(masterPassword, decryptedExisting);
                            } else {
                                throw new Error(`Failed to decrypt new format data for key: ${key}`);
                            }
                        } catch (decryptError) {
                            console.error("Error decrypting new format imported data:", decryptError);
                            showTemporaryStatus(`Erreur de décryptage des données importées (format récent) pour ${key}.`, 'error', 5000, 'settings-status');
                            return;
                        }
                    }
                }

                // Clear existing data and import new processed data
                await chrome.storage.local.clear();
                await chrome.storage.local.set(processedData);
                await chrome.storage.local.set({ migrated: true }); // Ensure migration flag is set

                showTemporaryStatus('Coffre-fort importé avec succès !', 'success', 3000, 'settings-status');
                await loadCredentials(); // Reload credentials in main view
                showView('main'); // Go back to main view
            } catch (error) {
                showTemporaryStatus('Erreur lors de l\'importation : Fichier invalide ou corrompu.', 'error', 5000, 'settings-status');
                console.error('Error importing vault:', error);
            } finally {
                importVaultInput.value = ''; // Clear the file input
            }
        };
        reader.readAsText(file);
    });

    // --- UTILITAIRES ---
    function showTemporaryStatus(message, type, duration = 3000, targetId = 'lock-status') {
        const statusEl = document.getElementById(targetId);
        statusEl.textContent = message;
        statusEl.style.color = type === 'success' ? '#28a745' : (type === 'error' ? '#dc3545' : '#ffc107'); // Green, Red, Orange
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.style.color = ''; // Reset color
        }, duration);
    }

    // --- MIGRATION DES DONNÉES ---
    async function migrateOldDataIfNecessary() {
        const storageStatus = await chrome.storage.local.get('migrated');
        if (storageStatus.migrated) {
            console.log('Migration déjà effectuée.');
            return;
        }

        console.log('Démarrage de la migration des anciennes données...');
        const allData = await chrome.storage.local.get(null);
        let newStorage = {};
        let migratedCount = 0;

        for (const key in allData) {
            if (key === 'check') {
                newStorage[key] = allData[key]; // Keep the master password check
                continue;
            }

            // Heuristic to detect old format: key is likely a hostname and not a UUID
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) && key.includes('.')) {
                try {
                    const encryptedOld = allData[key];
                    const decryptedOld = await decryptData(masterPassword, encryptedOld);
                    if (decryptedOld) {
                        const oldCreds = JSON.parse(decryptedOld);
                        const newId = crypto.randomUUID();
                        const newCreds = {
                            id: newId, // Store the UUID inside the object
                            site: key, // The old key was the site
                            name: oldCreds.name || key, // Use old name or fallback to site
                            username: oldCreds.username,
                            password: oldCreds.password,
                            notes: oldCreds.notes || '' // Ensure notes are carried over
                        };
                        newStorage[newId] = await encryptData(masterPassword, JSON.stringify(newCreds));
                        migratedCount++;
                    } else {
                        console.error(`Migration: Could not decrypt old data for ${key}. Skipping.`);
                    }
                } catch (e) {
                    console.error(`Migration error for key ${key}:`, e);
                }
            } else {
                newStorage[key] = allData[key]; // Keep already valid entries (or non-credential keys)
            }
        }

        await chrome.storage.local.clear(); // Clear all old data
        await chrome.storage.local.set(newStorage); // Save new structure
        await chrome.storage.local.set({ migrated: true }); // Set flag
        console.log(`Migration terminée. ${migratedCount} identifiants mis à jour.`);
    }

    // --- SUGGESTION D'AJOUT D'IDENTIFIANT ---
    async function checkAndSuggestCredentials() {
    if (!currentHost) {
        console.log("checkAndSuggestCredentials: currentHost est vide, masquage de la bannière.");
        suggestionBanner.classList.add('hidden');
        return;
    }
    console.log("checkAndSuggestCredentials: Host actuel détecté:", currentHost);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
        console.log("checkAndSuggestCredentials: Onglet non trouvé, masquage de la bannière.");
        suggestionBanner.classList.add('hidden');
        return;
    }

    let detectedCredentialsOnPage = null;
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const usernameInputs = document.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"], input[type="text"][name*="user"], input[type="text"][name*="login"], input[id*="username"], input[id*="login"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');

                let detectedUsername = '';
                let detectedPassword = '';
                let detectedName = '';

                for (const input of usernameInputs) {
                    if (input.value) {
                        detectedUsername = input.value;
                        break;
                    }
                }
                for (const input of passwordInputs) {
                    if (input.value) {
                        detectedPassword = input.value;
                        break;
                    }
                }

                if (detectedUsername && detectedPassword) {
                    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
                    if (ogTitle) {
                        detectedName = ogTitle.replace(/ - .*/, '');
                    } else {
                        detectedName = document.title ? document.title.replace(/ - .*/, '') : '';
                    }

                    if (!detectedName && usernameInputs.length > 0) {
                        detectedName = usernameInputs[0].placeholder || usernameInputs[0].labels[0]?.textContent || '';
                        if (detectedName) {
                            detectedName = detectedName.replace(/:|\*|\s/g, '').trim();
                        }
                    }
                    if (!detectedName) {
                         detectedName = window.location.hostname.replace('www.', '');
                    }
                }

                if (detectedUsername && detectedPassword) {
                    return { username: detectedUsername, password: detectedPassword, name: detectedName };
                }
                return null;
            },
        });

        if (results && results[0] && results[0].result) {
            detectedCredentialsOnPage = results[0].result;
            console.log("checkAndSuggestCredentials: Identifiants détectés sur la page:", detectedCredentialsOnPage);
        } else {
            console.log("checkAndSuggestCredentials: Aucun identifiant détecté sur la page.");
        }
    } catch (error) {
        console.error("checkAndSuggestCredentials: Erreur lors de l'exécution du script de détection :", error);
    }

    if (!detectedCredentialsOnPage || !detectedCredentialsOnPage.username || !detectedCredentialsOnPage.password) {
        console.log("checkAndSuggestCredentials: Pas d'identifiant valide détecté, masquage de la bannière.");
        suggestionBanner.classList.add('hidden');
        detectedCredentials = null; 
        return;
    }

    const allStoredData = await chrome.storage.local.get(null);
    let foundMatchingSiteAndName = false;
    console.log("checkAndSuggestCredentials: Vérification des identifiants stockés...");

    for (const uuid in allStoredData) {
        if (uuid === 'check' || uuid === 'migrated') continue; 

        try {
            const storedCreds = JSON.parse(await decryptData(masterPassword, allStoredData[uuid]));

            console.log(`  Comparaison : Stored (Site: ${storedCreds.site}, Name: ${storedCreds.name}) vs Detected (Site: ${currentHost}, Name: ${detectedCredentialsOnPage.name})`);

            if (storedCreds.site && storedCreds.site.toLowerCase() === currentHost.toLowerCase() &&
                storedCreds.name && storedCreds.name.toLowerCase() === detectedCredentialsOnPage.name.toLowerCase()) {

                foundMatchingSiteAndName = true;
                console.log("  Correspondance exacte (site et nom) trouvée !");
                break; 
            }
        } catch (e) {
            console.error(`checkAndSuggestCredentials: Erreur lors du décryptage ou de l'analyse JSON pour la clé ${uuid}:`, e);
        }
    }

    console.log("checkAndSuggestCredentials: Résultat final - foundMatchingSiteAndName:", foundMatchingSiteAndName);

    if (!foundMatchingSiteAndName) {
        detectedCredentials = detectedCredentialsOnPage; 
        suggestionBanner.classList.remove('hidden');
        console.log("checkAndSuggestCredentials: Affichage de la bannière de suggestion.");
    } else {
        suggestionBanner.classList.add('hidden');
        detectedCredentials = null; 
        console.log("checkAndSuggestCredentials: Masquage de la bannière de suggestion (correspondance trouvée).");
    }
}

    // Run initialization
    init();
});