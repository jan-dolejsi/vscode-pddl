/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';

export class PlannerUserOptionsSelector {

    private NO_OPTIONS: OptionsQuickPickItem = { label: 'No options.', options: '', description: '' };
    private optionsHistory: OptionsQuickPickItem[] = [ this.NO_OPTIONS, { label: 'Specify options...', newValue: true, options: '', description: '' }];

    async getPlannerOptions() {
        let optionsSelected = await vscode.window.showQuickPick(this.optionsHistory,
            { placeHolder: 'Optionally specify planner switches or press ENTER to use default planner configuration.', ignoreFocusOut: true });

        if (!optionsSelected) { return null; } // operation canceled by the user by pressing Escape
        else if (optionsSelected.newValue) {
            let optionsEntered = await vscode.window.showInputBox({ placeHolder: 'Specify planner options.' });
            if (!optionsEntered) { return null; }
            optionsSelected = { label: optionsEntered, options: optionsEntered, description: '' };
        }
        else if (optionsSelected !== this.NO_OPTIONS) {
            // a previous option was selected - lets allow the user to edit it before continuing
            let optionsEntered = await vscode.window.showInputBox({value: optionsSelected.options, placeHolder: 'Specify planner options.', prompt: 'Adjust the options, if needed and press Enter to continue.'});
            if (!optionsEntered) { return null; } // canceled by the user
            optionsSelected = { label: optionsEntered, options: optionsEntered, description: '' };
        }

        let indexOf = this.optionsHistory.findIndex(option => option.options === optionsSelected.options);
        if (indexOf > -1) {
            this.optionsHistory.splice(indexOf, 1);
        }
        this.optionsHistory.unshift(optionsSelected); // insert to the first position
        return optionsSelected.options;
    }
}

class OptionsQuickPickItem implements vscode.QuickPickItem {
    label: string;
    description: string;
    options: string;
    newValue?: boolean;
}
