;Dummy domain for mock-testing

(define (domain domain1)

(:requirements :strips)

(:predicates
    (p)
)

(:action a
    :parameters ()
    :precondition (not (p))
    :effect (p)
)

)