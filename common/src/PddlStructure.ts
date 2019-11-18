/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { PddlSyntaxNode } from './PddlSyntaxNode';
import { PddlTokenType } from './PddlTokenizer';

export class PddlStructure {

    /* DOMAIN KEYWORDS */
    static readonly DOMAIN = 'domain';
    static readonly REQUIREMENTS = ':requirements';
    static readonly TYPES = ':types';
    static readonly CONSTANTS = ':constants';
    static readonly PREDICATES = ':predicates';
    static readonly FUNCTIONS = ':functions';
    static readonly CONSTRAINTS = ':constraints';
    static readonly PDDL_DOMAIN_SECTIONS = [PddlStructure.DOMAIN, PddlStructure.REQUIREMENTS, PddlStructure.TYPES, PddlStructure.CONSTANTS, PddlStructure.PREDICATES, PddlStructure.FUNCTIONS, PddlStructure.CONSTRAINTS];

    /* DOMAIN STRUCTURES */
    static readonly DERIVED = ':derived';
    static readonly ACTION = ':action';
    static readonly DURATIVE_ACTION = ':durative-action';
    static readonly PROCESS = ':process';
    static readonly EVENT = ':event';
    static readonly PDDL_DOMAIN_STRUCTURES = [PddlStructure.DERIVED, PddlStructure.ACTION, PddlStructure.DURATIVE_ACTION, PddlStructure.PROCESS, PddlStructure.EVENT];

    /* PROBLEM KEYWORDS */
    static readonly PROBLEM = 'problem';
    static readonly PROBLEM_DOMAIN = ':domain';
    static readonly OBJECTS = ':objects';
    static readonly INIT = ':init';
    static readonly GOAL = ':goal';
    static readonly METRIC = ':metric';
    static readonly PDDL_PROBLEM_SECTIONS = [PddlStructure.PROBLEM, PddlStructure.PROBLEM_DOMAIN, PddlStructure.REQUIREMENTS, PddlStructure.OBJECTS, PddlStructure.INIT, PddlStructure.GOAL, PddlStructure.CONSTRAINTS, PddlStructure.METRIC];

    /* ACTION KEYWORDS */
    static readonly PARAMETERS = ':parameters';
    static readonly PRECONDITION = ':precondition';
    static readonly EFFECT = ':effect';
    static readonly PDDL_ACTION_SECTIONS = [PddlStructure.PARAMETERS, PddlStructure.PRECONDITION, PddlStructure.EFFECT];

    /* DURATIVE-ACTION KEYWORDS */
    static readonly DURATION = ':duration';
    static readonly CONDITION = ':condition';
    static readonly PDDL_DURATIVE_ACTION_SECTIONS = [PddlStructure.PARAMETERS, PddlStructure.DURATION, PddlStructure.CONDITION, PddlStructure.EFFECT];

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

    /**
     * Determines which PDDL sections/keywords/structures are allowed at the currentNode
     * @param siblingReferenceNode node for which siblings are retrieved
     * @param currentNode node that is used to split the sibling nodes to before/after
     * @param siblingType to filter the siblings by type
     * @param allSupportedSections all supported ordered PDDL sections
     * @param allSupportedStructures additional PDDL structures (e.g. action/durative-action/process/effect/derived)
     */
    static getSupportedSectionsHere(siblingReferenceNode: PddlSyntaxNode, currentNode: PddlSyntaxNode, siblingType: PddlTokenType, allSupportedSections: string[], allSupportedStructures: string[]): string[] {
        let precedingSiblings = siblingReferenceNode.getPrecedingSiblings(siblingType, currentNode);
        let followingSiblings = siblingReferenceNode.getFollowingSiblings(siblingType, currentNode);

        let supportedSectionsHere = allSupportedSections;

        precedingSiblings.forEach(predecessor => {
            supportedSectionsHere = PddlStructure.getFollowingSections(PddlStructure.stripBracket(predecessor), supportedSectionsHere);
        });

        followingSiblings.reverse().forEach(successor => {
            supportedSectionsHere = PddlStructure.getPrecedingSections(PddlStructure.stripBracket(successor), supportedSectionsHere);
        });

        if (followingSiblings.every(successor => allSupportedStructures.find(sectionName => sectionName === PddlStructure.stripBracket(successor)))) {
            supportedSectionsHere = supportedSectionsHere.concat(allSupportedStructures);
        }

        if (precedingSiblings.some(successor => allSupportedStructures.find(sectionName => sectionName === PddlStructure.stripBracket(successor)))) {
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

    static getPrecedingKeywordOrSelf(node: PddlSyntaxNode): PddlSyntaxNode {
        let parent = node.getParent();
        if (parent && parent.isType(PddlTokenType.Keyword)) {
            return parent;
        }
        else {
            return node;
        }
    }
}