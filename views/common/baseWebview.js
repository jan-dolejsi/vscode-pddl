
let vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.warn(error);
    // swallow, so in the script can be tested in a browser
}

function postMessage(message) {
    if (vscode) { vscode.postMessage(message); }
}

/**
 * Posts message containing just the command
 * @param {string} command
 */
function postCommand(command) {
    postMessage({ 'command': command });
}

let theme = 'unknown';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onLoad() {
    postCommand('onload');
    applyTheme(document.body.className);

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutationRecord) {
            applyTheme(mutationRecord.target.className);
        });    
    });
    
    const target = document.body;
    observer.observe(target, { attributes : true, attributeFilter : ['class'] });
}

/**
 * Extracts the VS Code theme from the document.body.class attribute
 * @param {string} documentBodyClass document.body.class attribute value
 * @returns {string} 'dark' or 'light'
 */ 
function getThemeName(documentBodyClass) {
    const prefix = 'vscode-';
    if (documentBodyClass.startsWith(prefix)) {
        // strip prefix
        documentBodyClass = documentBodyClass.substr(prefix.length);
    }

    if (documentBodyClass === 'high-contrast') {
        documentBodyClass = 'dark'; // the high-contrast theme seems to be an extreme case of the dark theme
    }
    return documentBodyClass;
}

/**
 * Applies theme
 * @param {Element} element html element to apply visibility style to based on the theme
 * @param {string} newTheme theme extracted from the document.body.class attribute
 */
function applyThemeToElement(element, newTheme) {
    element.style.display = (element.getAttribute('theme') === newTheme) ? 'initial' : 'none';
}

/**
 * Applies the VS Code theme to all menuButton elements
 * @param {string} documentBodyClass theme extracted from the document.body.class attribute
 * @returns {void}
 */
function applyTheme(documentBodyClass) {
    newTheme = getThemeName(documentBodyClass);

    if (theme === newTheme) { return; }
    theme = newTheme;

    console.log('Applying theme: ' + newTheme);
    const buttons = document.getElementsByClassName('menuButton');
    for (let index = 0; index < buttons.length; index++) {
        const button = buttons[index];
        applyThemeToElement(button, newTheme);
    }

    document.body.dispatchEvent(new CustomEvent("themeChanged", { detail: { newTheme: newTheme } }));
}
