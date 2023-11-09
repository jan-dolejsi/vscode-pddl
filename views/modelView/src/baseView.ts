/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/** VS Code stub, so we can work with it in a type safe way. */
interface VsCodeApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postMessage(payload: any): void;
}

declare function postCommand(command: string): void;

// declare const acquireVsCodeApi: () => VsCodeApi;

export declare const vscode: VsCodeApi | undefined;
// let vscode: VsCodeApi | undefined;
// try {
//     vscode = acquireVsCodeApi();
// } catch (error) {
//     console.warn(error);
//     // swallow, so the script can be tested in a browser
// }

export function closeInset(): void {
    postCommand('close');
}

export function expandInset(): void {
    postCommand('expand');
}

export type CommandMessage = { command: string; data: never };

export function addWindowEventListener(messageHandler: (message: CommandMessage) => void): void {
    window.addEventListener('message', event => {
        const message = event.data;
        console.log("Received message: " + message.command);
    
        switch (message.command) {
            case 'setIsInset':
                setIsInset(message.value);
                break;
            default:
                messageHandler(message);
        }
    });
}

/**
 * Sets whether this is an inset or a document content
 * @param {boolean} isInset true if this view is an inset
 */
export function setIsInset(isInset: boolean): void {
    const insetMenu = document.getElementById('insetMenu');
    if (insetMenu) { insetMenu.style.display = isInset ? 'initial' : 'none'; }

    const separators = document.getElementsByClassName('separator');
    for (let index = 0; index < separators.length; index++) {
        const separator = separators[index] as HTMLElement;
        separator.style.display = isInset ? 'initial' : 'none';
    }

    // apply style to the body
    document.body.style.overflow = isInset ? 'scroll' : '';
    document.body.style.margin = document.body.style.padding = "0px";
}
/**
 * This must be declared in the same file, where it is used : (.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace vis {

    type IdType = number | string;

    class DataSet<T> {
        constructor(content: T[]);

        length: number;

        add(node: T): void;
        add(nodes: T[]): void;
        get(id: number): T;
        get(filter: { filter: (edge: Edge) => boolean }): T[];
        clear(): void;
        update(nodes: Node[]): void;
        update(node: Node): void;
    }

    type Direction = 'DU' | 'UD' | 'RL' | 'LR';

    interface Options {
        layout?: { hierarchical: { direction: Direction } };
        edges?: { font: { color: string | undefined; strokeColor: string | undefined } };
        configure?: boolean;
    }

    export class Network {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(container: HTMLElement, treeData: { nodes: DataSet<Node>; edges: DataSet<Edge> }, options: any);

        fit(options?: { animation: boolean }): void;
        getSelectedNodes(): number[];
        releaseNode(): void;
        focus(nodeId: number, arg1: { animation: boolean; locked: boolean }): void;
        selectNodes(arg0: number[]): void;

        on(arg0: string, event: (nodeEvent: { nodes: number[] }) => void): void;

        setOptions(options: Options): void;
        setSize(width: string, height: string): void;
    }
}

export interface Edge {
    readonly id?: number; // required by the DataSet class, but not used
    readonly from: number;
    readonly to: number;
    readonly label?: string;
    // readonly title: string; what was this for?
}

export interface Node {
    id: number;
    label: string;
    shape?: string;
    group?: string;
}

export interface ThemeChangedEvent extends Event {
    detail: { newTheme: string };
}

/**
 * Applies theme to a network object
 * @param network network visualization object
 * @param newTheme new theme applied
 */
export function applyThemeToNetwork(network: vis.Network, newTheme: string): void {
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

export function getElementByIdOrThrow(elementId: string): HTMLElement {
    const el = document.getElementById(elementId);
    if (!el) {
        throw new Error(`HTML document does not contain element with ID=${elementId}`);
    }
    return el;
}
