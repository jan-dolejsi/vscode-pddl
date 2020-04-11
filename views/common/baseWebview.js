
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

function applyTheme(newTheme) {
    const prefix = 'vscode-';
    if (newTheme.startsWith(prefix)) {
        // strip prefix
        newTheme = newTheme.substr(prefix.length);
    }

    if (newTheme === 'high-contrast') {
        newTheme = 'dark'; // the high-contrast theme seems to be an extreme case of the dark theme
    }

    if (theme === newTheme) { return; }
    theme = newTheme;

    console.log('Applying theme: ' + newTheme);
    const buttons = document.getElementsByClassName('menuButton');
    for (let index = 0; index < buttons.length; index++) {
        const button = buttons[index];
        button.style.display = (button.getAttribute('theme') === newTheme) ? 'initial' : 'none';
    }

    document.body.dispatchEvent(new CustomEvent("themeChanged", { detail: { newTheme: newTheme } }));
}
