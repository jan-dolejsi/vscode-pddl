/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    window, extensions, ExtensionContext, MessageItem, Uri, commands, ViewColumn, workspace, ConfigurationTarget
} from 'vscode';

import { PddlConfiguration } from '../configuration';

import * as fs from 'fs';
import { OverviewPage, SHOULD_SHOW_OVERVIEW_PAGE } from './OverviewPage';

const util = require('util');
require('util.promisify').shim();

const readFile = util.promisify(fs.readFile);

enum TipResponse { Ok, Later, Next }

const LATER = 'LATER';
const NEVER = 'NEVER'
const ACCEPTED = 'ACCEPTED';

export class StartUp {

    overviewPage: OverviewPage;

    constructor(private context: ExtensionContext, private pddlConfiguration: PddlConfiguration) {
        this.overviewPage = new OverviewPage(context, this.pddlConfiguration);
    }

    atStartUp(): void {
        this.showOverviewPage();
        this.showWhatsNew();
        this.showTips();
        this.suggestFolderIsOpen();
        this.suggestAutoSave();
        this.uninstallLegacyExtension(this.pddlConfiguration);
    }

    NEXT_TIP_TO_SHOW = 'nextTipToShow';
    WHATS_NEW_SHOWN_FOR_VERSION = 'whatsNewShownForVersion';
    ACCEPTED_TO_WRITE_A_REVIEW = 'acceptedToWriteAReview';
    NEVER_AUTO_SAVE = 'neverAutoSave';

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

    async suggestAutoSave(): Promise<void> {
        if (this.context.globalState.get(this.NEVER_AUTO_SAVE, false)) return;

        let option = "files.autoSave";
        if (workspace.getConfiguration().get(option) === "off") {
            let changeConfigurationOption: MessageItem = { title: "Configure auto-save"};
            let notNow: MessageItem = { title: "Not now" };
            let never: MessageItem = { title: "Do not ask again" };
            let options = [changeConfigurationOption, notNow, never];

            let choice = await window.showInformationMessage("Switching on `File > Auto Save` saves you from constant file saving when working with command-line tools.", ...options);

            switch(choice){
                case changeConfigurationOption:
                    workspace.getConfiguration().update(option, "afterDelay", ConfigurationTarget.Global);
                    break;
                case never:
                    this.context.globalState.update(this.NEVER_AUTO_SAVE, true);
                case notNow:
                default:
                    // do nothing
                    break;
            }
        }
    }

    async showWhatsNew(): Promise<boolean> {
        let thisExtension = extensions.getExtension("jan-dolejsi.pddl");
        let currentVersion = thisExtension.packageJSON["version"];
        var lastValue = this.context.globalState.get(this.WHATS_NEW_SHOWN_FOR_VERSION, "0.0.0");

        if (currentVersion != lastValue) {

            if (true) {
                let changeLogMd = this.context.asAbsolutePath('CHANGELOG.md');
                commands.executeCommand('markdown.showPreview', Uri.file(changeLogMd), null, {
                    sideBySide: false,
                    locked: true
                });
            }
            else {
                let changeLog = this.context.asAbsolutePath('CHANGELOG.html');
                let html = fs.readFileSync(changeLog, { encoding: "utf-8" });

                let webViewPanel = window.createWebviewPanel(
                    "pddl.WhatsNew",
                    "PDDL: What's new?",
                    ViewColumn.Active,
                    {
                        retainContextWhenHidden: true,
                        enableFindWidget: true,
                        enableCommandUris: false,
                        enableScripts: true
                    }
                );

                webViewPanel.webview.html = html;

                this.context.subscriptions.push(webViewPanel);
            }
            this.context.globalState.update(this.WHATS_NEW_SHOWN_FOR_VERSION, currentVersion);
        }

        return true;
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

    showOverviewPage(): void {
        var shouldShow = this.context.globalState.get<boolean>(SHOULD_SHOW_OVERVIEW_PAGE, true);
        if (shouldShow) {
            this.overviewPage.showWelcomePage(false);
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