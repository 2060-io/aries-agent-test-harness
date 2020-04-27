Feature: Aries agent issue credential functions RFC 0036

  @T000-API10-RFC0036
  Scenario: create a schema and credential definition in order to issue a credential
     Given "Alice" has a public did
      When "Alice" creates a new schema
       And "Alice" creates a new credential definition
      Then "Alice" has an existing schema
       And "Alice" has an existing credential definition

  @T001-API10-RFC0036
  Scenario: issue a credential from one agent to another with manual flow
     Given "Alice" and "Bob" have an existing connection
       And "Alice" has an existing schema and credential definition
      When "Alice" sends a credential offer
       And "Bob" sends a credential request
       And "Alice" issues a credential
       And "Bob" receives and acknowledges the credential
      Then "Alice" has an acknowledged credential issue
       And "Bob" has received a credential

  @T002-API10-RFC0036
  Scenario: issue a credential from one agent to another with automated flow
     Given "Alice" and "Bob" have an existing connection
       And "Alice" has an existing schema and credential definition
      When "Alice" initiates an automated credential issuance
       And "Bob" sends a credential request
       And "Bob" receives and acknowledges the credential
      Then "Bob" has received a credential