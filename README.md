
# Agda Check

This library aims to run typechecking and goal loading in `.agda` files.

## Installation

Install it globally:
`npm i -g agda-check`

## Usage

To num the script, simply run:

`agda-check file.agda`

And the script will typecheck the file. If an error is encountered, you should see an output similar to what Agda Load does on Emacs / Vim integration.

However, when no typechecking errors occur, and you have non resolve goals, agda-check will look for all the holes in the file and provide contexts for them. It does the equivalent of running AgdaContext (from Emacs or Vim) for all holes in the file. 

Example:

```agda
data Nat : Set where
  zero : Nat
  succ : Nat -> Nat

foo : Nat -> Nat
foo zero     = {!   !}
foo (succ p) = {! p !}
```

Should output:

```
All Goals
- ?0 : Nat
- ?1 : Nat

Goal: Nat
Have: _9

Goal: Nat
Have: Nat
- p : Nat

Checked!
```

If you have lots of imports in your agda file, this checking process could take a while, since it recursively checks all the imports. However, if you run `agda-check` multiple times for a file with many imports, the imports checking step is cached, so it takes less time.

## Contributing

Feel free to suggest features, improvements or open a PR. 

This is a Work In Progress.
