/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi 2020. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as os from 'os';
import * as path from 'path';
import { Uri, window } from 'vscode';

import { planner, OutputAdaptor } from 'pddl-workspace';
import { isHttp } from '../utils';

export class CommandPlannerProvider extends planner.PlannerProvider {
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

        let title: string | undefined;
        let syntax: string | undefined;

        if (newPlannerPath) {

            newPlannerPath = newPlannerPath.trim().replace(/\\/g, '/');

            // todo: validate that this planner actually works by sending a dummy request to it

            // const newPlannerScope = await this.askConfigurationScope();


            // if (!newPlannerScope) { return undefined; }
            // const configurationToUpdate = this.getConfigurationForScope(newPlannerScope);
            // if (!configurationToUpdate) { return undefined; }

            if (!isHttp(newPlannerPath)) {
                syntax = await this.askPlannerSyntax(previousConfiguration);
                if (syntax.trim() === "") {
                    syntax = "$(planner) $(options) $(domain) $(problem)";
                }
                title = path.basename(newPlannerPath);
            }
            else {
                title = newPlannerPath;
            }

            // Update the value in the target
            //configurationToUpdate.update(PLANNER_EXECUTABLE_OR_SERVICE, newPlannerPath, newPlannerScope.target);
        }

        return newPlannerPath !== undefined && syntax !== undefined && {
            kind: this.kind.kind,
            path: newPlannerPath,
            syntax: syntax,
            title: title,
            canConfigure: true,
            isSelected: true,
            scope: 'machine'
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

        // if (newPlannerOptions) {
        // todo: validate that this planner actually works by sending a dummy request to it

        // const configurationToUpdate = this.getConfigurationForScope(scope);
        // if (!configurationToUpdate) { return undefined; }

        // Update the value in the target
        // configurationToUpdate.update(PLANNER_EXECUTABLE_OPTIONS, newPlannerOptions, scope.target);
        // }

        return newPlannerOptions;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
    createPlanner(): planner.Planner {
        throw new Error("Method not implemented.");
    }
}

export class SolveServicePlannerProvider extends planner.PlannerProvider {
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
            valueSelection: existingHostAndPort, // [7, 16],
            value: existingValue,
            ignoreFocusOut: true
        });

        return newPlannerUrl !== undefined && {
            kind: this.kind.kind,
            url: newPlannerUrl,
            title: newPlannerUrl,
            canConfigure: true,
            isSelected: true,
            scope: 'machine'
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
    createPlanner(): planner.Planner {
        throw new Error("Method not implemented.");
    }
}

export class JavaPlannerProvider extends planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.JAVA_JAR;
    }
    getNewPlannerLabel(): string {
        return "$(file-binary) Select a Java JAR file...";
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    configurePlanner(_previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        throw new Error("Method not implemented.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        // do nothing
    }
    createPlanner(): planner.Planner {
        throw new Error("Method not implemented.");
    }
}

export class ExecutablePlannerProvider extends planner.PlannerProvider {
    get kind(): planner.PlannerKind {
        return planner.WellKnownPlannerKind.EXECUTABLE;
    }
    getNewPlannerLabel(): string {
        return "$(symbol-event) Select an executable on this computer...";
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async configurePlanner(_previousConfiguration?: planner.PlannerConfiguration): Promise<planner.PlannerConfiguration | undefined> {
        const filters = os.platform() === 'win32' ?
            {
                'Executable': ['exe'],
                'Batch file': ['bat', 'cmd']
            }
            : undefined;

        const executableUri = await selectedFile(`Select planner executable`, filters);
        if (!executableUri) { return undefined; }

        const newPlannerConfiguration: planner.PlannerConfiguration = {
            kind: this.kind.kind,
            canConfigure: true,
            scope: "global",
            path: executableUri.fsPath,
            title: path.basename(executableUri.fsPath),
            isSelected: true
        };

        return newPlannerConfiguration;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showHelp(_output: OutputAdaptor): void {
        throw new Error("Method not implemented.");
    }
    createPlanner(): planner.Planner {
        throw new Error("Method not implemented.");
    }

}


// const node: QuickPickItem = {
//     label: "$(file-code) Select a Node.js file..."
// };

// const python: QuickPickItem = {
//     label: "$(file-text) Select a Python file..."
// };


async function selectedFile(label: string, filters?: { [name: string]: string[] }): Promise<Uri | undefined> {
    const selectedUris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: label,
        filters: filters
    });

    if (!selectedUris) {
        return undefined;
    }

    return selectedUris[0];
}
