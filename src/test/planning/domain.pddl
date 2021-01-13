;Dummy domain for mock-testing

(define (domain domain1)

(:requirements :strips :negative-preconditions)

(:predicates
    (p)
)

(:action a
    :parameters ()
    :precondition (not (p))
    :effect (p)
)

)