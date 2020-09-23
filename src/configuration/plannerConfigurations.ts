/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as os from 'os';
import * as path from 'path';
import { Uri, window } from 'vscode';

import { planner, OutputAdaptor, utils } from 'pddl-workspace';
import { isHttp } from '../utils';
import { PlannerExecutable } from '../planning/PlannerExecutable';

export class CommandPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.COMMAND;
    }
    getNewPlannerLabel(): string {
        return "$(terminal) Input a command...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.path;

        let newPlannerPath = await window.showInputBox({
            prompt: "Enter PDDL planner path local command",
            placeHolder: `planner.exe OR java -jar c:\\planner.jar`,
            value: existingValue,
            ignoreFocusOut: true
        });

        let syntax: string | undefined;

        if (newPlannerPath) {

            newPlannerPath = newPlannerPath.trim().replace(/\\/g, '/');

            // todo: validate that this planner actually works by sending a dummy request to it

            if (!isHttp(newPlannerPath)) {
                syntax = await this.askPlannerSyntax(previousConfiguration);
                if (syntax.trim() === "") {
                    syntax = "$(planner) $(options) $(domain) $(problem)";
                }
            }
        }

        return newPlannerPath !== undefined && syntax !== undefined
            && this.createPlannerConfiguration(newPlannerPath, syntax);
    }

    createPlannerConfiguration(command: string, syntax: string | undefined): planner.PlannerConfiguration {
        const title = isHttp(command)
            ? command
            : path.basename(command);

        return {
            kind: this.kind.kind,
            path: command,
            syntax: syntax,
            title: title,
            canConfigure: true
        };
    }

    async askPlannerSyntax(previousConfiguration?: planner.PlannerConfiguration): Promise<string | undefined> {
        const existingValue = previousConfiguration?.syntax;

        const newPlannerOptions = await window.showInputBox({
            prompt: "In case you use command line switches and options, override the default syntax. For more info, see (the wiki)[https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner].",
            placeHolder: `$(planner) $(options) $(domain) $(problem)`,
            value: existingValue,
            ignoreFocusOut: true
        });

        return newPlannerOptions;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class SolveServicePlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.SERVICE_SYNC;
    }
    getNewPlannerLabel(): string {
        return "$(cloud-upload) Input a sync. service URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "http://solver.planning.domains/solve";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter synchronous service URL",
            placeHolder: `http://host:port/solve`,
            valueSelection: existingHostAndPort,
            value: existingValue,
            ignoreFocusOut: true
        });

        return newPlannerUrl !== undefined && this.createPlannerConfiguration(newPlannerUrl);
    }

    createPlannerConfiguration(newPlannerUrl: string): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class RequestServicePlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.SERVICE_ASYNC;
    }
    getNewPlannerLabel(): string {
        // compare-changes, $(arrow-both)
        return "$(cloud-upload)$(cloud-download) Input a async. service URL...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const existingValue = previousConfiguration?.url ?? "http://localhost:8080/request";

        const existingUri = Uri.parse(existingValue);
        const indexOf = existingValue.indexOf(existingUri.authority);
        const existingHostAndPort: [number, number] | undefined
            = indexOf > -1 ? [indexOf, indexOf + existingUri.authority.length] : undefined;

        const newPlannerUrl = await window.showInputBox({
            prompt: "Enter asynchronous service URL",
            placeHolder: `http://host:port/request`,
            valueSelection: existingHostAndPort, //
            value: existingValue,
            ignoreFocusOut: true
        });

        return newPlannerUrl !== undefined && this.createPlannerConfiguration(newPlannerUrl);
    }

    createPlannerConfiguration(newPlannerUrl: string): planner.PlannerConfiguration {
        return {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class JavaPlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.JAVA_JAR;
    }
    getNewPlannerLabel(): string {
        return "$(file-binary) Select a Java JAR file...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters = 
            {
                'Java executable archive': ['jar'],
            };

        const defaultUri = previousConfiguration && previousConfiguration.path && Uri.file(previousConfiguration?.path);

        const executableUri = await selectedFile(`Select executable JAR`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    createPlanner(configuration: planner.PlannerConfiguration, plannerOptions: string, workingDirectory: string): planner.Planner | undefined {
        return new PlannerExecutable(`java -jar ${utils.Util.q(configuration.path)}`, plannerOptions, configuration.syntax, workingDirectory);
    }
}

export class ExecutablePlannerProvider implements planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.EXECUTABLE;
    }
    getNewPlannerLabel(): string {
        return "$(symbol-event) Select an executable on this computer...";
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters = os.platform() === 'win32' ?
            {
                'Executable or batch file': ['exe', 'bat', 'cmd'],
                'Executable': ['exe'],
                'Batch file': ['bat', 'cmd'],
                'All files': ['*']
            }
            : undefined;

        const defaultUri = previousConfiguration && previousConfiguration.path && Uri.file(previousConfiguration?.path);

        const executableUri = await selectedFile(`Select planner executable`, defaultUri, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath)
        };

        return newPlannerConfiguration;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
}

export class Popf implements planner.PlannerProvider {

    get kind(): planner.PlannerKind {
        return { kind: 'popf' };
    }

    getNewPlannerLabel(): string {
        return '$(mortar-board) POPF';
    }

    async configurePlanner(previousConfiguration?: planner.PlannerConfiguration | undefined): Promise<planner.PlannerConfiguration | undefined> {

        const filters = os.platform() === 'win32' ?
            {
                'POPF Executable': ['exe']
            }
            : undefined;

        const defaultUri: Uri | undefined = !!(previousConfiguration?.path) ?
            Uri.file(previousConfiguration.path) :
            undefined;

        const popfUri = await selectedFile(`Select POPF`, defaultUri, filters);
        if (!popfUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            path: popfUri.fsPath,
            syntax: '$(planner) $(options) $(domain) $(problem)',
            title: 'POPF'
        };

        return newPlannerConfiguration;
    }

    getPlannerOptions(): planner.PlannerOption[] {
        return [
            { option: "-n", description: "Continuous searching after the first plan is reached in quest for alternative plans with a better metric" },
            { option: "-citation", description: "Display citation to relevant conference paper (ICAPS 2010)" },
            { option: "-b", description: "Disable best-first search - if EHC fails, abort" },
            { option: "-E", description: "Skip EHC: go straight to best-first search" },
            { option: "-e", description: "Use standard EHC instead of steepest descent" },
            { option: "-h", description: "Disable helpful-action pruning" },
            { option: "-k", description: "Disable compression-safe action detection" },
            { option: "-c", description: "Enable the tie-breaking in RPG that favour actions that slot into the partial order earlier" },
            { option: "-S", description: "Sort initial layer facts in RPG by availability order (only use if using -c)" },
            { option: "-m", description: "Disable the tie-breaking in search that favours plans with shorter makespans" },
            { option: "-F", description: "Full FF helpful actions (rather than just those in the RP applicable in the current state)" },
            { option: "-I", description: "Disable the hybrid Bellman-Ford--LP solver" },
            { option: "-T", description: "Rather than building a partial order, build a total-order" },
            // { option: "-J123", description: "Generate search graph" },
            { option: "-v16", description: "Info about RPG generation instanciation of action found (Number of applicable actions)" },
            { option: "-v64", description: "Numeric fluents output" },
            { option: "-v1048576", description: "Verbose output details the relaxed plan for each action applied (in the standard output)." },
            { option: "-L4", description: "Prints out some LP stuff to the console " },
            { option: "-L8", description: "Outputs the LP program into a stateevaluation.lp file" },
            { option: "-L16", description: "Generates the lp program with bounds of the state variables; but overwrites the files, so you only get files for the last variable" },
        ];
    }
}


// const node: QuickPickItem = {
//     label: "$(file-code) Select a Node.js file..."
// };

// const python: QuickPickItem = {
//     label: "$(file-text) Select a Python file..."
// };


async function selectedFile(label: string, defaultUri?: Uri, filters?: { [name: string]: string[] }): Promise<Uri | undefined> {
    const selectedUris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: label,
        filters: filters,
        defaultUri: defaultUri
    });

    if (!selectedUris) {
        return undefined;
    }

    return selectedUris[0];
}
