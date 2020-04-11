
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function closeInset() {
    postCommand('close');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const insetMenu = document.getElementById('insetMenu');
    if (insetMenu) { insetMenu.style.display = isInset ? 'initial' : 'none'; }

    const separators = document.getElementsByClassName('separator');
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function applyThemeToNetwork(network, newTheme) {
    let foreground; let background;
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