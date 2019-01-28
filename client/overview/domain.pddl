; Hello World example domain

(define (domain hello)

(:requirements :strips :typing :negative-preconditions)

(:types thing)

(:predicates
    (can_hear ?t - thing) ; can the `thing` hear
    (said_hello_to ?t - thing) ; records that was said to the `thing`
)

; this action greets one thing by its name
(:action say-hello
    :parameters (?t - thing)
    :precondition (and
        ; we only ever need to great once
        (not (said_hello_to ?t))
        ; only great someone if they are near
        (can_hear ?t)
    )
    :effect (and
        ; record that we said hello
        (said_hello_to ?t)
    )
)

)