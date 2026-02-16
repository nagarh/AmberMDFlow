#!/usr/bin/env python3
"""
AmberMDFlow - Entry point when running from project root.
Uses the ambermdflow package. For installed package: use `ambermdflow` or `python -m ambermdflow`.
"""

from ambermdflow.app import app

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=7860)
