/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

export class PddlFactory {
    static createEmptyDomain(name: string): string {
        return `(define (domain ${name})
        (:requirements :strips )
        )`;
    }

    static createEmptyProblem(name: string, domainName: string): string {
        return `(define (problem ${name}) (:domain ${domainName})
        (:objects 
        )
        
        (:init
        )
        
        (:goal (and
            )
        )
        )
        `;
    }
}