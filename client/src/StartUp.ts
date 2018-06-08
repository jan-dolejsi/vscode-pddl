/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, extensions, ExtensionContext, MessageItem, Uri, commands
} from 'vscode';

import * as fs from 'fs';

const util = require('util');
require('util.promisify').shim();

const readFile = util.promisify(fs.readFile);

import { PddlConfiguration } from './configuration';

enum TipResponse { Ok, Later, Next }

const LATER = 'LATER';
const NEVER = 'NEVER'
const ACCEPTED = 'ACCEPTED';

export class StartUp {

    private context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this.context = context;
    }

    atStartUp(pddlConfiguration: PddlConfiguration): void {
        this.showWhatsNew();
        this.showTips();
        this.uninstallLegacyExtension(pddlConfiguration);
    }

    NEXT_TIP_TO_SHOW = 'nextTipToShow';
    WHATS_NEW_SHOWN_FOR_VERSION = 'whatsNewShownForVersion';
    ACCEPTED_TO_WRITE_A_REVIEW = 'acceptedToWriteAReview';

    async showTips(): Promise<boolean> {
        var tipsPath = this.context.asAbsolutePath('tips.txt');
        var tips: string[] = (await readFile(tipsPath, 'utf-8')).split("\n");

        var nextTipToShow = this.context.globalState.get(this.NEXT_TIP_TO_SHOW, 0);

        let shouldContinue = true;
        for (let index = nextTipToShow; index < tips.length && shouldContinue; index++) {
            const tip = tips[index];

            // skip tips that were removed subsequently as obsolete
            if (tip.trim() == "") {
                nextTipToShow++;
                continue;
            }

            var response = await this.showTip(tip);
            switch (response) {
                case TipResponse.Ok:
                    shouldContinue = false;
                    nextTipToShow++;
                    break;
                case TipResponse.Later:
                    shouldContinue = false;
                    break;
                case TipResponse.Next:
                    nextTipToShow++;
                    break;
            }
        }

        if (nextTipToShow == tips.length) {
            this.askForReview();
        }

        this.context.globalState.update(this.NEXT_TIP_TO_SHOW, nextTipToShow);

        return true;
    }

    async showTip(tip: string): Promise<TipResponse> {
        let optionOk: MessageItem = { title: "OK, got it." };
        let optionLater: MessageItem = { title: "Remind me later." };
        let optionNext: MessageItem = { title: "Show next tip..." };
        let options: MessageItem[] = [optionOk, optionLater, optionNext];

        let choice = await window.showInformationMessage(tip, ...options);

        switch (choice) {
            case optionOk: return TipResponse.Ok;
            case optionLater: return TipResponse.Later;
            case optionNext: return TipResponse.Next;
            default: return TipResponse.Later;
        }
    }

    suggestFolderIsOpen(): void {
        // The PDDL extension works best if you open VS Code in a specific folder. Use File > Open Folder ...
    }

    showWhatsNew(): void {
        let thisExtension = extensions.getExtension("jan-dolejsi.pddl");
        let currentVersion = thisExtension.packageJSON["version"];
        var lastValue = this.context.globalState.get(this.WHATS_NEW_SHOWN_FOR_VERSION, "0.0.0");

        if (currentVersion != lastValue) {
            //let changeLog = this.context.asAbsolutePath('CHANGELOG.md');
            let changeLog = 'https://marketplace.visualstudio.com/items/jan-dolejsi.pddl/changelog';
            commands.executeCommand('vscode.open', Uri.parse(changeLog));

            this.context.globalState.update(this.WHATS_NEW_SHOWN_FOR_VERSION, currentVersion);
        }
    }

    async askForReview(): Promise<void> {
        // what was the user response last time? 
        var accepted = this.context.globalState.get(this.ACCEPTED_TO_WRITE_A_REVIEW, LATER);

        if (accepted == LATER) {
            let optionAccepted: MessageItem = { title: "OK, let's give feedback" };
            let optionLater: MessageItem = { title: "Remind me later" };
            let optionNever: MessageItem = { title: "Never" };
            let options: MessageItem[] = [optionAccepted, optionLater, optionNever];

            let choice = await window.showInformationMessage('Are you finding the PDDL Extension useful? Do you want to boost our motivation? Please give us (5) stars or even write a review...', ...options);

            switch (choice) {
                case optionAccepted:
                    let reviewPage = 'https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl#review-details';
                    commands.executeCommand('vscode.open', Uri.parse(reviewPage));
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, ACCEPTED);
                    break;
                case optionNever:
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, NEVER);
                    break;
                case optionLater:
                default:
                    this.context.globalState.update(this.ACCEPTED_TO_WRITE_A_REVIEW, LATER);
                    break;
            }

        }
    }

    uninstallLegacyExtension(pddlConfiguration: PddlConfiguration): void {
        let extension = extensions.getExtension("jan-dolejsi.pddl-parser");

        if (extension) {
            pddlConfiguration.copyFromLegacyParserConfig()
            window.showWarningMessage(`The internal preview extension 'PDDL SL8 Only' is now obsolete. Please uninstall it, or it will interfere with functionality of the PDDL extension.`);
        }
    }
}