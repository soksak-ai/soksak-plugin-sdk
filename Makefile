SHELL := /bin/sh
.PHONY: guard preflight prepare build verify package require-tooling attest require-dest install

PACKAGE_VERSION := $(shell node -p 'require("./package.json").version')
PACKAGE_OUT ?= $(CURDIR)/artifacts/$(PACKAGE_VERSION)
TOOLING_SDK_VERSION := 0.0.16
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
	@mkdir -p "$(dir $(PACKAGE_OUT))"
	@node bin/soksak-sdk package --root "$(CURDIR)" --spec-root "$(CURDIR)/.dependencies/soksak-spec" --commit "$$(git rev-parse --verify HEAD)" --out "$(PACKAGE_OUT)"

require-tooling:
	@case "$(origin SDK_ROOT):$(origin SDK_RELEASE)" in "command line:command line") ;; *) echo 'SDK_ROOT and SDK_RELEASE must be exact command-line inputs' >&2; exit 64 ;; esac; \
		case "$(SDK_ROOT):$(SDK_RELEASE)" in /*:/*) ;; *) echo 'SDK_ROOT and SDK_RELEASE must be absolute paths' >&2; exit 64 ;; esac; \
		root="$(SDK_ROOT)"; tool="$$root/bin/soksak-sdk"; \
		test -d "$$root" && test ! -L "$$root" && test -f "$$tool" && test ! -L "$$tool" && test -f "$(SDK_RELEASE)" && test ! -L "$(SDK_RELEASE)" || { echo 'SDK self-tooling inputs must be regular release files' >&2; exit 78; }; \
		tooling_package_version="$$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$$root/package.json")"; \
		tooling_release_version="$$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$(SDK_RELEASE)")"; \
		test "$$tooling_package_version" = "$(TOOLING_SDK_VERSION)" && test "$$tooling_release_version" = "$(TOOLING_SDK_VERSION)" || { echo "TOOLCHAIN_MISMATCH soksak-sdk required=$(TOOLING_SDK_VERSION) package=$$tooling_package_version release=$$tooling_release_version" >&2; exit 78; }

attest: require-tooling package
	@platform="$$(node -p 'process.platform')"; architecture="$$(node -p 'process.arch')"; \
		node_version="$$(node -p 'process.versions.node')"; pnpm_version="$$(pnpm --version)"; \
		"$(SDK_ROOT)/bin/soksak-sdk" attest --release-dir "$(PACKAGE_OUT)" \
		--spec-root "$(CURDIR)/.dependencies/soksak-spec" --tooling-release "$(SDK_RELEASE)" \
		--mode native --platform "$$platform" --architecture "$$architecture" \
		--tool "node=$$node_version" --tool "pnpm=$$pnpm_version"

require-dest:
	@case "$(origin DEST)" in "command line") ;; *) echo 'DEST must be an absolute command-line version directory' >&2; exit 64 ;; esac
	@case "$(DEST)" in /*) ;; *) echo 'DEST must be an absolute directory' >&2; exit 64 ;; esac
	@test "$$(basename "$(DEST)")" = "$(PACKAGE_VERSION)" || { echo 'DEST basename must equal the SDK version' >&2; exit 64; }
	@test -d "$$(dirname "$(DEST)")" && test ! -L "$$(dirname "$(DEST)")" || { echo 'DEST parent must be a regular directory' >&2; exit 66; }
	@test "$(origin SPEC_RELEASE)" = "command line" && test "$(origin SPEC_ARTIFACT)" = "command line" || { echo 'install requires exact SPEC_RELEASE and SPEC_ARTIFACT command-line inputs' >&2; exit 64; }

install: require-dest attest
	@set -eu; destination="$(DEST)"; parent="$$(dirname "$$destination")"; \
		set -- "$(PACKAGE_OUT)"/*.tgz; test $$# -eq 1 && test -f "$$1" || { echo 'SDK release must contain exactly one package archive' >&2; exit 65; }; archive="$$1"; \
		candidate="$$parent/.soksak-sdk-$(PACKAGE_VERSION).install.$$$$"; test ! -e "$$candidate"; \
		cleanup() { test ! -d "$$candidate" || rm -r "$$candidate"; }; trap cleanup EXIT HUP INT TERM; \
		mkdir "$$candidate"; tar -xzf "$$archive" --strip-components=1 -C "$$candidate"; \
		cp "$(PACKAGE_OUT)/release.json" "$$candidate/release.json"; \
		"$$candidate/bin/soksak-sdk" prepare --manifest "$(SPEC_RELEASE)" --artifact "$(SPEC_ARTIFACT)" >/dev/null; \
		if test -e "$$destination"; then test -d "$$destination" && test ! -L "$$destination" || { echo 'DEST exists and is not a regular directory' >&2; exit 66; }; diff -qr "$$candidate" "$$destination" >/dev/null || { echo 'SDK_INSTALL_VERSION_CONFLICT' >&2; exit 65; }; echo 'SDK_INSTALL_UNCHANGED version=$(PACKAGE_VERSION)'; else mv "$$candidate" "$$destination"; echo 'SDK_INSTALL_PUBLISHED version=$(PACKAGE_VERSION)'; fi
