/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { Uri } from 'vscode';
import { WebviewAdapter } from './view';

/**
 * Base class for domain/problem view panels.
 */
export class BaseViewPanel {

    constructor(public readonly uri: Uri, protected readonly panel: WebviewAdapter) {
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async postMessage(command: string, payload: any): Promise<boolean> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const message: any = { command: command };
        Object.keys(payload).forEach(key => message[key] = payload[key]);

        return this.panel.postMessage(message);
    }
}