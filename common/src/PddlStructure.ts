/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlSyntaxNode } from './PddlSyntaxNode';

export class PddlStructure {
    
    static readonly DOMAIN = 'domain';
    static readonly REQUIREMENTS = ':requirements';
    static readonly TYPES = ':types';
    static readonly CONSTANTS = ':constants';
    static readonly PREDICATES = ':predicates';
    static readonly FUNCTIONS = ':functions';
    static readonly CONSTRAINTS = ':constraints';
    static readonly PDDL_DOMAIN_SECTIONS = [PddlStructure.DOMAIN, PddlStructure.REQUIREMENTS, PddlStructure.TYPES, PddlStructure.CONSTANTS, PddlStructure.PREDICATES, PddlStructure.FUNCTIONS, PddlStructure.CONSTRAINTS];

    static readonly DERIVED = ':derived';
    static readonly ACTION = ':action';
    static readonly DURATIVE_ACTION = ':durative-action';
    static readonly PROCESS = ':process';
    static readonly EVENT = ':event';
    static readonly PDDL_DOMAIN_STRUCTURES = [PddlStructure.DERIVED, PddlStructure.ACTION, PddlStructure.DURATIVE_ACTION, PddlStructure.PROCESS, PddlStructure.EVENT];

    static findPrecedingSection(newSectionName: string, defineNode: PddlSyntaxNode, supportedSections: string[]): PddlSyntaxNode {
        let precedingSections = PddlStructure.getPrecedingSections(newSectionName, supportedSections);
        // let followingSections = PddlStructure.getFollowingSections(newSectionName, supportedSections);

        let previousSectionNode = defineNode;

        for (let index = 0; index < precedingSections.length; index++) {
            let node = defineNode.getFirstOpenBracket(precedingSections[index]);
            if (node) {
                previousSectionNode = node;
            }
        }

        return previousSectionNode;
    }

    static getSupportedSectionsHere(currentNode: PddlSyntaxNode, allSupportedSections: string[], allSupportedStructures: string[]): string[] {
        let precedingSiblings = currentNode.getPrecedingSiblings();
        let followingSiblings = currentNode.getFollowingSiblings();

        let supportedSectionsHere = allSupportedSections;

        precedingSiblings.forEach(predecessor => {
            supportedSectionsHere = PddlStructure.getFollowingSections(PddlStructure.stripBracket(predecessor), supportedSectionsHere);
        });

        followingSiblings.reverse().forEach(successor => {
            supportedSectionsHere = PddlStructure.getPrecedingSections(PddlStructure.stripBracket(successor), supportedSectionsHere);
        });

        if (currentNode.getFollowingSiblings().every(successor => allSupportedStructures.find(sectionName => sectionName === PddlStructure.stripBracket(successor)))) {
            supportedSectionsHere = supportedSectionsHere.concat(allSupportedStructures);
        }

        if (currentNode.getPrecedingSiblings().some(successor => allSupportedStructures.find(sectionName => sectionName === PddlStructure.stripBracket(successor)))) {
            // only suggest structures
            supportedSectionsHere = allSupportedStructures;
        }

        return supportedSectionsHere;
    }

    static stripBracket(node: PddlSyntaxNode): string {
        return node.getToken().tokenText.replace('(', '').trim();
    }
    
    static getPrecedingSections(newSectionName: string, supportedSections: string[]): string[] {
        let indexOfNewSection = supportedSections.indexOf(newSectionName);
        if (indexOfNewSection === -1) { return supportedSections; }

        return supportedSections.slice(0, indexOfNewSection);
    }

    static getFollowingSections(newSectionName: string, supportedSections: string[]): string[] {
        let indexOfNewSection = supportedSections.indexOf(newSectionName);
        if (indexOfNewSection === -1) { return supportedSections; }

        return supportedSections.slice(indexOfNewSection + 1);
    }
}