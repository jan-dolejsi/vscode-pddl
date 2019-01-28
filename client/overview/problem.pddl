; Hello World example problem

(define (problem hello-world)

(:domain hello)

(:objects
    ; the only thing is the `world`
    world - thing
)

(:init
    ; Let's assume that the world can hear us
    (can_hear world)
)

(:goal
    (and
        ; The only goal is to reach a state where we said 'hello'
        (said_hello_to world)
    )
)
)