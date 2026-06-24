# FoxTales iOS — project bootstrap.
#
# Prerequisites: Xcode (15+) and XcodeGen (`brew install xcodegen`).

PROJECT := FoxTales.xcodeproj
SIM ?= platform=iOS Simulator,name=iPhone 15

.PHONY: project open build-app build-clip test clean

project: ## Generate FoxTales.xcodeproj from project.yml
	xcodegen generate

open: project ## Generate and open the project in Xcode
	open $(PROJECT)

build-app: project ## Compile the full app for the Simulator (no signing needed)
	xcodebuild -project $(PROJECT) -scheme FoxTales -destination '$(SIM)' build

build-clip: project ## Compile the App Clip for the Simulator
	xcodebuild -project $(PROJECT) -scheme FoxTalesClip -destination '$(SIM)' build

test: ## Run the FoxTalesCore unit tests in the Simulator
	xcodebuild -project $(PROJECT) -scheme FoxTalesCore -destination '$(SIM)' test

clean: ## Remove the generated project
	rm -rf $(PROJECT)
