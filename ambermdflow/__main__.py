"""Run the AmberMDFlow web server. Use: python -m ambermdflow or ambermdflow"""

from ambermdflow.app import app


def main():
    app.run(debug=False, host="0.0.0.0", port=7860)


if __name__ == "__main__":
    main()
