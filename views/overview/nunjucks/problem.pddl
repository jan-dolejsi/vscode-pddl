;; Template problem file
;;!pre-parsing:{type: "nunjucks", data: "problem0.json"}

; See the full Nunjucks syntax documentation: https://mozilla.github.io/nunjucks/templating.html

(define (problem {{data.name}})
	(:domain domain1)

	(:objects
	{% if data.products|length > 0 %}
		{{ data.products|join(' ', 'name')}} - product
	{% else %}
		; there are no products
	{% endif %}
	)

	(:init
		(= (manufacturing-cost) 0)
	{% for product in data.products %}
		(= (cost {{product.name}}) {{product.cost}})
		{% if product.manufactured %}(manufactured {{product.name}}){% endif %}
	{% else %}
		; there are no products
	{% endfor %}
	)

	(:goal (and

	{% for product in data.products %}
		{% if not product.manufactured %}
			(manufactured {{product.name}})
		{% endif %}
	{% endfor %}
	))
)

