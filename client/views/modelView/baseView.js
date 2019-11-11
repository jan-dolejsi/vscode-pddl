
var vscode = null;
try {
    vscode = acquireVsCodeApi();
}catch(error){
    console.error(error);
    // swallow, so in the script can be tested in a browser
}

function postMessage(message) {
    if (vscode) vscode.postMessage(message);
}

/**
 * Posts message containing just the command
 * @param {string} command
 */
function postCommand(command) {
    postMessage({ 'command': command });
}

var theme = 'unknown';

function onLoad() {
    postCommand('onload');
    applyTheme(document.body.className);

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutationRecord) {
            applyTheme(mutationRecord.target.className);
        });    
    });
    
    var target = document.body;
    observer.observe(target, { attributes : true, attributeFilter : ['class'] });
}

function applyTheme(newTheme) {
    var prefix = 'vscode-';
    if (newTheme.startsWith(prefix)) {
        // strip prefix
        newTheme = newTheme.substr(prefix.length);
    }

    if (newTheme === 'high-contrast') {
        newTheme = 'dark'; // the high-contrast theme seems to be an extreme case of the dark theme
    }

    if (theme === newTheme) return;
    theme = newTheme;

    console.log('Applying theme: ' + newTheme);
    var buttons = document.getElementsByClassName('menuButton');
    for (let index = 0; index < buttons.length; index++) {
        const button = buttons[index];
        button.style.display = (button.getAttribute('theme') === newTheme) ? 'initial' : 'none';
    }

    document.body.dispatchEvent(new CustomEvent("themeChanged", { detail: { newTheme: newTheme } }));
}

function closeInset() {
    postCommand('close');
}

function expandInset() {
    postCommand('expand');
}

window.addEventListener('message', event => {
    const message = event.data;
    console.log("Received message: " + message.command);

    switch (message.command) {
        case 'setIsInset':
            setIsInset(message.value);
            break;
        default:
            handleMessage(message);
    }
})

/**
 * Sets whether this is an inset or a document content
 * @param {boolean} isInset true if this view is an inset
 */
function setIsInset(isInset) {
    var insetMenu = document.getElementById('insetMenu');
    if (insetMenu) insetMenu.style.display = isInset ? 'initial' : 'none';

    var separators = document.getElementsByClassName('separator');
    for (let index = 0; index < separators.length; index++) {
        const separator = separators[index];
        separator.style.display = isInset ? 'initial' : 'none';
    }

    // apply style to the body
    document.body.style.overflow = isInset ? 'scroll' : '';
    document.body.style.margin = document.body.style.padding = "0px";
}

/**
 * Applies theme to a network object
 * @param {vis.Network} network network visualization object
 * @param {string} newTheme new theme applied
 */
function applyThemeToNetwork(network, newTheme) {
    var foreground; var background;
    switch (newTheme) {
        case 'dark':
            foreground = 'white';
            background = 'black';
            break;
        case 'light':
            foreground = 'black';
            background = 'white';
            break;
    }
    network.setOptions({ edges: { font: { color: foreground, strokeColor: background } } });
}