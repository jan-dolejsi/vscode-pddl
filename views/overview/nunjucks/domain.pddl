; This is a sample domain to demonstrate template-based problem file generation

(define (domain domain1)

    (:requirements :strips :fluents :typing :negative-preconditions)

    (:types
        product
    )

    (:predicates
        (manufactured ?p - product)
    )


    (:functions
        (cost ?p - product)
        (manufacturing-cost)
    )

    (:action manufacture
        :parameters (?p - product)
        :precondition (and (not (manufactured ?p)))
        :effect (and
            (manufactured ?p)
            (increase (manufacturing-cost) (cost ?p) )
        )
    )

)