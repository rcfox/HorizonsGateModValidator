# Use cases

An entry's `uses` array holds one object per distinct way the {ENTITY} can be
invoked.

## When to split

Base the split on the **input shape**, not on the runtime value of a single
input:

* **Split** into separate use cases when the branches accept **different
  inputs** — mutually exclusive inputs, or different required/optional position
  sets.
* **Do not split** when the branches use the **same input set** and it is the
  **value** of one input that selects the behaviour. Capture each behaviour
  inside that input's description instead.

A value-selected variant is still fully captured — in the input's description —
so documenting it there is not the disallowed "merging distinct behaviours".
Useful test: if splitting would yield use cases with identical input lists where
some inputs are merely ignored in one branch, keep a single use case and explain
the variants in the relevant input's description.

The **number of values supplied is part of the input shape**, so
count-dependent meanings call for separate use cases. When the count of supplied
values changes what the positions represent — three values read as a colour
versus four read as a leading value followed by a colour — give each count
configuration its own use case rather than overloading one position's description
with several count-conditioned meanings.

Beyond that, create separate use cases whenever the behaviour differs in any
observable way. When uncertain whether two behaviours are distinct, assume they
are distinct and split. It is acceptable to create redundant or overlapping use
cases; it is not acceptable to merge distinct behaviours into one.

## Branches that call different helpers

When two code paths take similar inputs but call different methods:

* Read the called methods far enough to understand the behavioural difference —
  the signature, nearby comments, and what the method does to the world.
* If the difference is clear, or evident from the names, reflect it in the use
  case descriptions.
* Make the descriptions distinct enough that a modder can tell which path applies
  to them, even when the exact implementation difference stays unclear.

## Describing a use case

Aim for 2-4 sentences per distinct use case, in distinct paragraphs. Say what
happens in the game, under what conditions, and what the modder observably gets.
The rules in `descriptions.md` apply.

## Ordering

Order `uses` by descending number of required inputs. For equal counts, compare
the ordered required-input lists element by element in {INPUT_ORDER}, and list
first the use whose first differing required input comes earlier.

Within a use, order inputs by {INPUT_ORDER}.

## No observable behaviour

If a case body is empty, falls through to a no-op, or has no observable game
effect, still record an entry for it: emit one use with no required and no
optional inputs, and describe it as a no-op (for example, "Reserved {ENTITY} with
no observable behaviour"). Record the situation in the review log so it can be
reviewed.
