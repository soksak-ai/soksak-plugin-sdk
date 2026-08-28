SHELL := /bin/sh
.PHONY: guard preflight prepare build verify package require-tooling attest

PACKAGE_VERSION := $(shell node -p 'require("./package.json").version')
PACKAGE_OUT ?= $(CURDIR)/artifacts/$(PACKAGE_VERSION)
TOOLING_SDK_VERSION := 0.0.13
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
	@node bin/soksak-sdk package --root "$(CURDIR)" --spec-root "$(CURDIR)/.dependencies/soksak-spec" --commit "$$(git rev-parse --verify HEAD)" --out "$(PACKAGE_OUT)"

require-tooling:
	@tool="$$(command -v soksak-sdk)" || { echo 'soksak-sdk is not selected by PATH' >&2; exit 78; }; \
		case "$$tool" in /*) ;; *) echo 'soksak-sdk PATH entry must be absolute' >&2; exit 78 ;; esac; \
		root="$$(cd "$$(dirname "$$tool")/.." && pwd -P)"; \
		test -f "$$tool" && test ! -L "$$tool" && test -f "$$root/release.json" && test ! -L "$$root/release.json" || { echo 'soksak-sdk PATH entry has no regular release.json' >&2; exit 78; }; \
		tooling_package_version="$$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$$root/package.json")"; \
		tooling_release_version="$$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$$root/release.json")"; \
		test "$$tooling_package_version" = "$(TOOLING_SDK_VERSION)" && test "$$tooling_release_version" = "$(TOOLING_SDK_VERSION)" || { echo "TOOLCHAIN_MISMATCH soksak-sdk required=$(TOOLING_SDK_VERSION) package=$$tooling_package_version release=$$tooling_release_version" >&2; exit 78; }

attest: require-tooling package
	@tool="$$(command -v soksak-sdk)"; tooling_root="$$(cd "$$(dirname "$$tool")/.." && pwd -P)"; \
		platform="$$(node -p 'process.platform')"; architecture="$$(node -p 'process.arch')"; \
		node_version="$$(node -p 'process.versions.node')"; pnpm_version="$$(pnpm --version)"; \
		soksak-sdk attest --release-dir "$(PACKAGE_OUT)" \
		--spec-root "$(CURDIR)/.dependencies/soksak-spec" --tooling-release "$$tooling_root/release.json" \
		--mode native --platform "$$platform" --architecture "$$architecture" \
		--tool "node=$$node_version" --tool "pnpm=$$pnpm_version"
