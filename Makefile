UUID := arch-updates@v9eq.github.io
SCHEMA := org.gnome.shell.extensions.arch-updates.gschema.xml

.PHONY: all pack install clean

all: pack

pack:
	mkdir -p dist
	glib-compile-schemas --strict --dry-run schemas
	gnome-extensions pack --force --out-dir=dist \
		--schema=schemas/$(SCHEMA) \
		--extra-source=indicator.js --extra-source=services.js \
		--extra-source=icons --extra-source=LICENSE .

install: pack
	gnome-extensions install --force dist/$(UUID).shell-extension.zip
	@echo 'Log out and back in, then run: gnome-extensions enable $(UUID)'

clean:
	rm -rf dist
