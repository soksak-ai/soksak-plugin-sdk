SHELL := /bin/sh
.PHONY: guard preflight prepare build verify package

PACKAGE_VERSION := $(shell node -p 'require("./package.json").version')
PACKAGE_OUT ?= $(CURDIR)/artifacts/$(PACKAGE_VERSION)
registry_flags = --@soksak:registry=$(REGISTRY) --config.minimum-release-age=0

guard:
	@case "$(origin REGISTRY)" in "command line") ;; undefined) echo 'REGISTRY must be given on the make command line: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; *) echo 'REGISTRY from the $(origin REGISTRY) is refused: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; esac
	@case "$(REGISTRY)" in http://*|https://*) ;; *) echo 'REGISTRY must be an absolute URL: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; esac

preflight:
	@scripts/check-build-environment.sh

prepare: guard preflight
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm install --frozen-lockfile $(registry_flags)
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm $(registry_flags) dependencies:prepare

build: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm $(registry_flags) build

verify: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm $(registry_flags) test

package: verify
	@node bin/soksak-sdk.mjs package --root "$(CURDIR)" --spec-root "$(CURDIR)/.dependencies/soksak-spec" --commit "$$(git rev-parse --verify HEAD)" --out "$(PACKAGE_OUT)"
