/*
 * Copyright (c) Jan Dolejsi 2022. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { planner } from 'pddl-workspace';
import { commands, MessageItem } from 'vscode';


export interface ProcessErrorMessageItem extends MessageItem {
    title: string;
    isCloseAffordance?: boolean;
    action?: (planner: planner.Planner) => void | Promise<void>;
}


export function cratePlannerConfigurationMessageItems(failedPlanner: planner.Planner): ProcessErrorMessageItem[] {
    return [
        {
            title: failedPlanner.providerConfiguration.configuration.canConfigure ?
                "Re-configure the planner" : "Show configuration",
            action: (): void => {
                // todo, if there is only one configuration of the kind, launch the configuration directly
                commands.executeCommand("pddl.showOverview");
            }
        }
    ];
}
