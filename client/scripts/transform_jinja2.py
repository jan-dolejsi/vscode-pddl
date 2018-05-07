#  --------------------------------------------------------------------------------------------
#  Copyright (c) Jan Dolejsi. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#  --------------------------------------------------------------------------------------------


import sys, os, datetime, json, io

def eprint(args):
    sys.stderr.write(args)

try:
    from jinja2 import Template
except ImportError:
    eprint("Jinja2 is not installed. Run this command in the terminal: python -m pip install jinja2")
    exit(-1)

# read the template from the standard input
template_text = "".join(sys.stdin.readlines())

def main(args):
    """ Transforms the problem file streamed in through the standard input using JSON the data file passed via command-line argument. """
    if len(args) < 1:
        eprint("Usage: {0} <data.json>".format(os.path.basename(sys.argv[0])))
        exit(-1)

    data_path = args[0]
    # with open(data_path, mode='r', encoding="utf-8") as fp:
    with io.open(data_path, mode='r', encoding="utf-8") as fp:
        input_data = json.load(fp)

    template = Template(template_text)

    rendered = template.render(data=input_data)

    # output the rednered template to the standard output
    print(rendered)
    print("; This PDDL problem file was generated using Jinja2 template")
    print(";    Python: " + sys.version)
    print(";    Data: " + data_path)
    print(";    Time: " + str(datetime.datetime.now()))

if __name__ == "__main__":
    main(sys.argv[1:])
