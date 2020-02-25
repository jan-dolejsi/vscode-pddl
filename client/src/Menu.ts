/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2019. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import { QuickPickItem, window, QuickPickOptions, CancellationToken, commands } from 'vscode';

export class Menu {
    constructor(private items: MenuItem[], private options?: QuickPickOptions ) {

    }

    async show(token?: CancellationToken): Promise<MenuItem | undefined> {
        let selectedItem = await window.showQuickPick(this.items, this.options, token);

        if (selectedItem !== undefined) {
            await commands.executeCommand(selectedItem.command, ...(selectedItem.args ?? []));
        }

        return selectedItem;
    }
}

export interface MenuItem extends QuickPickItem {
    command: string;
    args?: any[];
}