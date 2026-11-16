UUID := arch-updates@v9eq.github.io
SCHEMA := org.gnome.shell.extensions.arch-updates.gschema.xml
STAGE := $(CURDIR)/.build/extension
EXTRA_JS := $(filter-out extension.js prefs.js,$(notdir $(wildcard src/*.js)))

.PHONY: all pack install clean

all: pack

pack:
	glib-compile-schemas --strict --dry-run schemas
	rm -rf "$(STAGE)"
	mkdir -p "$(STAGE)/schemas" dist
	cd src && find . -type f -name '*.js' -exec cp --parents '{}' "$(STAGE)" \;
	cp src/metadata.json src/stylesheet.css LICENSE "$(STAGE)/"
	cp -R icons "$(STAGE)/"
	cp schemas/*.gschema.xml "$(STAGE)/schemas/"
	gnome-extensions pack --force --out-dir=dist \
		--schema=schemas/$(SCHEMA) \
		$(addprefix --extra-source=,$(EXTRA_JS)) \
		--extra-source=backends --extra-source=icons --extra-source=LICENSE "$(STAGE)"

install: pack
	gnome-extensions install --force dist/$(UUID).shell-extension.zip
	@echo 'Log out and back in, then run: gnome-extensions enable $(UUID)'

clean:
	rm -rf dist .build
