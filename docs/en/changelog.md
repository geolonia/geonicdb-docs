---
title: Changelog
description: Vela OS changelog
outline: deep
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ReactiveCore Rules - Automated entity processing rule engine with pattern matching, conditional expressions, and actions (#344, #378, #379, #380, #381, #383, #384, #389)
  - Pattern matching for entity types, IDs, and attribute names
  - Conditional expressions with logical operators (AND/OR)
  - Multiple actions: createEntity, updateEntity, deleteEntity, sendNotification
  - Infinite loop prevention mechanism
  - Change Stream integration for real-time event processing
  - Local testing support via `npm start`
- Comprehensive quota system for SaaS launch (#356, #391)
  - Request quotas (rate limits, daily/monthly limits)
  - Storage quotas (entity/attribute counts)
  - Real-time monitoring with DynamoDB
  - Tenant-specific quota configuration
  - Retry-After headers for rate limit responses
- MCP (Model Context Protocol) server integration (#392)
  - Five integrated tools for AI-driven entity management
  - Entity CRUD operations
  - Batch operations
  - Time-series queries
  - JSON-LD context management
  - Administrative operations
- Smart Data Models support (#347, #368, #373)
  - 19 standard data models with property details
  - AI-driven entity creation guidance
  - propertyDetails metadata for all models
- Zod v4 runtime type validation for all API endpoints (#358)
- CADDE (Cross-Agency Data Distribution and Exchange) service integration
- Tenant-level IP whitelisting for enhanced security
- Vector tile generation API
- Temporal API for time-series data
- Entity snapshot functionality
- JSON-LD context management
- Data catalog API (CKAN/DCAT compatible)
- QUICKSTART.md guide for new users (#372)
- DEPLOYMENT.md with comprehensive AWS deployment instructions (#382)
- VelaOS Instruction Manual (docs/instruction.md) and PDF generation script (npm run docs:pdf) (#400)
- E2E tests validating all samples in instruction.md (tests/e2e/features/common/instruction.feature) (#400)

### Changed
- Upgraded Node.js requirement to >=24.13.0
- Upgraded MongoDB to 7.1.0
- Migrated test framework to Cucumber.js (Gherkin in Japanese)
- Consolidated configuration values into `src/config/defaults.ts` (#355)
- Consolidated MCP tools from 8 to 5 for improved maintainability (#392)
- Consolidated version numbers, imported from package.json (#393)

### Fixed
- Suppressed local server MongoDB shutdown errors (#394)
- Quota system bug fixes: Retry-After headers, negative count bypass, time unit mismatch (#391)
- Enhanced NGSI-LD schema validation (#365, #366, #367, #370)
- Resolved NGSI-LD URI pattern inconsistencies (#364)
- Addressed security vulnerabilities (ReDoS prevention, input validation)
- Rule engine edge cases: empty subscriptionIds, macro substitution, entity type resolution

### Security
- Added length limits for entity IDs (256 chars), types (256 chars), and attribute names (256 chars) (#353, #369)
- Tenant-level IP-based access restrictions
- JWT authentication with role-based access control (super_admin, tenant_admin, user)
- ReDoS (Regular Expression Denial of Service) prevention
- Input validation for all API endpoints

## [0.1.0] - 2026-02-11

### Added
- Initial VelaOS release - FIWARE Orion-compatible Context Broker on AWS Lambda
- NGSIv2 API implementation
  - Entity CRUD operations
  - Subscriptions
  - Registrations
  - Batch operations
  - Query language support (q, mq parameters)
- NGSI-LD API implementation
  - Entity operations
  - Subscriptions
  - Context source registrations
  - Batch operations
  - Query language support (q, scopeQ, pick, omit, lang parameters)
- Full interoperability between NGSIv2 and NGSI-LD APIs
- Multi-tenancy support with Fiware-Service header
- Federation capabilities via context provider forwarding
- Geospatial query support using spatial IDs
- JWT authentication and authorization
- Administrative API for tenant and user management
- MongoDB storage with replica set support
- AWS Lambda deployment with SAM templates
- EventBridge integration for subscription matching
- SQS FIFO queues for notification delivery
- MQTT support for notifications
- Comprehensive E2E test suite (Cucumber.js)
- Unit test coverage ~99% (Jest)
- Local development server with in-memory MongoDB (`npm start`)

[unreleased]: https://github.com/geolonia/vela/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/geolonia/vela/releases/tag/v0.1.0
