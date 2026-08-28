SHELL := /bin/sh
.PHONY: guard preflight prepare build verify package require-tooling attest

PACKAGE_VERSION := $(shell node -p 'require("./package.json").version')
PACKAGE_OUT ?= $(CURDIR)/artifacts/$(PACKAGE_VERSION)
registry_flags = --@soksak:registry=$(REGISTRY) --config.minimum-release-age=0
spec_input_args = $(if $(filter command line,$(origin SPEC_RELEASE)),--manifest "$(SPEC_RELEASE)" --artifact "$(SPEC_ARTIFACT)")

guard:
	@case "$(origin REGISTRY)" in "command line") ;; undefined) echo 'REGISTRY must be given on the make command line: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; *) echo 'REGISTRY from the $(origin REGISTRY) is refused: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; esac
	@case "$(REGISTRY)" in http://*|https://*) ;; *) echo 'REGISTRY must be an absolute URL: make verify REGISTRY=http://host:port/' >&2; exit 64 ;; esac
	@case "$(origin SPEC_RELEASE):$(origin SPEC_ARTIFACT)" in "undefined:undefined"|"command line:command line") ;; *) echo 'SPEC_RELEASE and SPEC_ARTIFACT must be supplied together on the make command line' >&2; exit 64 ;; esac
	@case "$(origin SPEC_RELEASE):$(SPEC_RELEASE):$(SPEC_ARTIFACT)" in "undefined::"|"command line:/"*":/"*) ;; *) echo 'SPEC_RELEASE and SPEC_ARTIFACT must be absolute paths' >&2; exit 64 ;; esac

preflight:
	@scripts/check-build-environment.sh

prepare: guard preflight
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm install --frozen-lockfile $(registry_flags)
	@node scripts/prepare-spec.mjs $(spec_input_args)

build: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm $(registry_flags) build

verify: prepare
	@CI=1 PNPM_DISABLE_SELF_UPDATE_CHECK=1 pnpm $(registry_flags) test

package: verify
	@node bin/soksak-sdk.mjs package --root "$(CURDIR)" --spec-root "$(CURDIR)/.dependencies/soksak-spec" --commit "$$(git rev-parse --verify HEAD)" --out "$(PACKAGE_OUT)"

require-tooling:
	@case "$(origin TOOLING_ROOT)" in "command line") ;; *) echo 'TOOLING_ROOT must be an absolute command-line path to the prior extracted SDK release' >&2; exit 64 ;; esac
	@case "$(origin TOOLING_RELEASE)" in "command line") ;; *) echo 'TOOLING_RELEASE must be an absolute command-line path to the prior SDK release.json' >&2; exit 64 ;; esac
	@case "$(TOOLING_ROOT):$(TOOLING_RELEASE)" in /*:/*) ;; *) echo 'TOOLING_ROOT and TOOLING_RELEASE must be absolute paths' >&2; exit 64 ;; esac
	@test -d "$(TOOLING_ROOT)" && test ! -L "$(TOOLING_ROOT)" && test -f "$(TOOLING_ROOT)/bin/soksak-sdk.mjs" || { echo 'TOOLING_ROOT is not an extracted regular SDK release' >&2; exit 66; }
	@test -f "$(TOOLING_RELEASE)" && test ! -L "$(TOOLING_RELEASE)" || { echo 'TOOLING_RELEASE is not a regular file' >&2; exit 66; }
	@test -z "$$(find "$(TOOLING_ROOT)" -type l -print -quit)" || { echo 'TOOLING_ROOT contains a symbolic link' >&2; exit 66; }

attest: require-tooling package
	@platform="$$(node -p 'process.platform')"; architecture="$$(node -p 'process.arch')"; \
		node_version="$$(node -p 'process.versions.node')"; pnpm_version="$$(pnpm --version)"; \
		node "$(TOOLING_ROOT)/bin/soksak-sdk.mjs" attest --release-dir "$(PACKAGE_OUT)" \
		--spec-root "$(CURDIR)/.dependencies/soksak-spec" --tooling-release "$(TOOLING_RELEASE)" \
		--mode native --platform "$$platform" --architecture "$$architecture" \
		--tool "node=$$node_version" --tool "pnpm=$$pnpm_version"
