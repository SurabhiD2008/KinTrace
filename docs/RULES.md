# Guideline rules: sources and criteria

Every rule in `src/guidelines` is a deterministic TypeScript function written from the sources below. All sources were read on **11 November 2026**. Criteria are restated in our own words; quotations are short and marked.

KinTrace reports only: Meets criteria / Worth discussing / No criteria met. It never outputs a percentage, a score of how probable something is, or a diagnosis.

## Conventions used by every rule

- **Relatives.** Only blood relatives count, at their true degree. Step and adoptive relatives never count. Degrees follow the NICE definitions (CG164 and CG71 give the same lists): first-degree = parents, siblings, children; second-degree = grandparents, grandchildren, aunts, uncles, nieces, nephews, half-siblings. A half-aunt or half-uncle is third-degree.
- **One relative, one count.** A relative counts once per criterion however many matching conditions are recorded. The same relative may count in several criteria.
- **Confidence.** A condition marked "unsure" is not counted; it makes the step Unknown and is listed as a gap. A condition marked "reported" is counted and the person is flagged as self-reported evidence.
- **Unknown.** A missing age, sex or detail never passes or fails a step by assumption. It makes the step Unknown, and the finding becomes "Worth discussing: could be met if completed".
- **Sex.** Where a criterion names a sex, "intersex" and "unknown" both make that step Unknown for that relative.
- **"Before age N"** means age at diagnosis or event strictly less than N.
- **Same side of the family.** See CG164 below. A relative on the maternal side and a relative on the paternal side are not combined. Siblings, children and their descendants are on both sides.

## 1. NICE CG164: familial breast cancer

- **Official title:** Familial breast cancer: classification, care and managing breast cancer and related risks in people with a family history of breast cancer (Clinical guideline CG164)
- **Publisher:** National Institute for Health and Care Excellence (NICE). Published 25 June 2013, last updated 14 November 2023.
- **URL:** https://www.nice.org.uk/guidance/cg164/chapter/Recommendations (recommendation 1.3.3, "Referral from primary care")
- **Applies to:** people "without a personal history of breast cancer".

Recommendation 1.3.3 says people who meet any of the following should be offered referral to secondary care. Each is one rule.

| Rule id | Criterion (our words) |
| --- | --- |
| `cg164-female-under-40` | One first-degree female relative diagnosed with breast cancer before age 40 |
| `cg164-male-any-age` | One first-degree male relative diagnosed with breast cancer at any age |
| `cg164-bilateral-under-50` | One first-degree relative with bilateral breast cancer, the first primary diagnosed before age 50 |
| `cg164-two-relatives` | Two first-degree relatives, or one first-degree and one second-degree relative, diagnosed with breast cancer at any age |
| `cg164-breast-and-ovarian` | One first- or second-degree relative with breast cancer and one first- or second-degree relative with ovarian cancer, at any age; one of the two is first-degree |
| `cg164-three-relatives` | Three first- or second-degree relatives diagnosed with breast cancer at any age |

Outcome when met: **Meets criteria**.

Reading decisions:

- **Same side.** Recommendation 1.3.3 itself does not say the relatives must be on the same side of the family. The phrase "on the same side of the family" appears only in 1.4.4 (referral to a specialist genetic clinic). The source does not say otherwise for 1.3.3, so KinTrace applies the same-side rule to every criterion that combines relatives (`cg164-two-relatives`, `cg164-breast-and-ovarian`, `cg164-three-relatives`), as the product brief requires. This is stricter than the literal text of 1.3.3.
- **Breast and ovarian in one person.** The criterion names two relatives. KinTrace requires two different people.
- **Bilateral.** Counted when a breast cancer is recorded as bilateral, or left and right breast cancers are both recorded. If the side is not recorded, the step is Unknown.
- **Not implemented.** Recommendation 1.3.4 (seek advice from secondary care when other features are present, such as Jewish ancestry, sarcoma before 45, glioma, or two or more relatives on the father's side) and the specialist-clinic criteria in 1.4.4, which use average ages. KinTrace does not hold ancestry or those tumour types.
- **Personal history.** KinTrace evaluates the family history even if the proband has breast cancer recorded; the guideline's 1.3.3 is written for people without it. The report must say so.

## 2. Amsterdam II criteria: Lynch syndrome

- **Official title:** New clinical criteria for hereditary nonpolyposis colorectal cancer (HNPCC, Lynch syndrome) proposed by the International Collaborative Group on HNPCC. Vasen HF, Watson P, Mecklin JP, Lynch HT. Gastroenterology 1999;116(6):1453-6.
- **URLs:** https://pubmed.ncbi.nlm.nih.gov/10348829/ (citation; PubMed holds no abstract) and, for the criteria text, the US National Cancer Institute's Genetics of Colorectal Cancer (PDQ) summary, updated 21 March 2025: https://www.cancer.gov/types/colorectal/hp/colorectal-genetics-pdq
- **Scope:** international.

One rule, `amsterdam-ii`. All of the following:

| Step | Criterion (our words) | Checked by |
| --- | --- | --- |
| 1 | At least three family members with a Lynch-associated cancer: colorectal, endometrial, small bowel, ureter or renal pelvis | KinTrace |
| 2 | One of them is a first-degree relative of the other two | KinTrace |
| 3 | At least two successive generations are affected | KinTrace |
| 4 | At least one was diagnosed before age 50 | KinTrace |
| 5 | Familial adenomatous polyposis has been excluded | Clinician confirms |
| 6 | The tumours have been verified by pathology | Clinician confirms |

Outcome when steps 1 to 4 are met: **Meets criteria**. Steps 5 and 6 are always shown and never change the status.

Reading decisions:

- **The proband counts.** The criteria are about the family; the NCI text says "family member". A proband with a Lynch-associated cancer is one of the affected people.
- **Same side.** The affected people must be blood relatives of each other, so the rule is evaluated separately for the maternal and paternal side (the proband and their descendants belong to both).
- **Successive generations.** The NCI summary shortens this to "Two affected generations"; KinTrace keeps "successive" from the brief and the original criteria: two affected people one generation apart.
- **Reach.** Only relatives up to third degree are considered, because that is as far as the relationship engine assigns a degree.

## 3. NICE CG71: familial hypercholesterolaemia

- **Official title:** Familial hypercholesterolaemia: identification and management (Clinical guideline CG71)
- **Publisher:** NICE. Published 27 August 2008, last updated 4 October 2019.
- **URL:** https://www.nice.org.uk/guidance/cg71/chapter/Recommendations (recommendations 1.1.1 and 1.1.3, and "Terms used")

Recommendation 1.1.1: suspect familial hypercholesterolaemia in adults with a total cholesterol above 7.5 mmol/l **or** "a personal or family history of premature coronary heart disease". The guideline defines that as a coronary event "before 60 years of age in an index individual or first-degree relative". Recommendation 1.1.3: if total cholesterol is not known, offer to measure it.

One rule, `cg71-premature-chd`:

| Step | Criterion (our words) |
| --- | --- |
| 1 | The proband or a first-degree relative has had a coronary event |
| 2 | The event happened before age 60 |

Outcome when met: **Worth discussing** (the guideline says to suspect the condition and measure cholesterol; it is not a referral criterion on its own).

Reading decisions:

- **No second-degree threshold.** The recommendations and definitions name only the index individual and first-degree relatives. (The Simon Broome criteria, in an appendix of the full guideline, do have a second-degree threshold, but they also need cholesterol values, which KinTrace does not hold.) Second-degree relatives never trigger this rule.
- **Personal history counts.** The proband's own coronary event before 60 meets the rule.
- **Coronary event** is the `coronary_event` condition (heart attack, angina, bypass, stent). Stroke and sudden cardiac death are not counted here.

## 4. Dutch Lipid Clinic Network criteria: family-history item only

- **Source read:** Nordestgaard BG et al. Familial hypercholesterolaemia is underdiagnosed and undertreated in the general population: Consensus Statement of the European Atherosclerosis Society. Eur Heart J 2013;34(45):3478-90, Table 1.
- **URL:** https://pmc.ncbi.nlm.nih.gov/articles/PMC3844152/
- **Scope:** international. NICE CG71 recommendation 1.1.5 names these criteria as one of two ways to make a clinical diagnosis.

Table 1, group 1 (family history):

| Item | Wording (our words) | Value for the family-history group | In KinTrace |
| --- | --- | --- | --- |
| (i) | First-degree relative with known premature coronary heart disease: before 55 in men, before 60 in women | 1 | Checked |
| (ii) | First-degree relative with LDL cholesterol above the 95th percentile for age, sex and country | 1 | Unknown: needs lab data |
| (iii) | First-degree relative with tendon xanthoma or corneal arcus | 2 | Unknown: needs examination |
| (iv) | Child under 18 with LDL cholesterol above the 95th percentile | 2 | Unknown: needs lab data |

Only the highest value in the group counts, so item (i) alone gives 1 of a possible 2 for the family-history item.

One rule, `dlcn-family-history`. Steps 1 and 2 check item (i); items (ii) to (iv) are shown as "clinician confirms" steps with result Unknown and never change the status. Outcome when item (i) is met: **Worth discussing**. This is one published criterion item, always labelled "family-history item". KinTrace never computes or shows a total.

Reading decisions:

- **Coronary heart disease only.** The table read says "coronary heart disease" for item (i). Some reproductions say "coronary and/or vascular disease". KinTrace follows the table read: `coronary_event` only.
- **Sex threshold is the relative's sex.** A relative of unknown sex with an event before 55 passes (premature under either threshold); between 55 and 59 the step is Unknown; at 60 or over it fails.

## 5. NICE NG238: cardiovascular disease

- **Official title:** Cardiovascular disease: risk assessment and reduction, including lipid modification (NICE guideline NG238)
- **Publisher:** NICE. Published 14 December 2023.
- **URL:** https://www.nice.org.uk/guidance/ng238/chapter/Recommendations
- **Also read:** the QRISK3 calculator, which recommendation 1.1.7 says to use: https://qrisk.org/

What the guideline says about family history:

- 1.1.7: use the QRISK3 tool for formal assessment. One of that tool's inputs is "Angina or heart attack in a 1st degree relative < 60?".
- 1.4.2: use clinical findings, lipid profile and family history together when judging whether a familial lipid disorder is present.
- 1.4.4: use CG71 to decide whether to suspect familial hypercholesterolaemia.
- 1.4.5: mentions a "first-degree family history of premature coronary heart disease" without giving an age.

**The guideline gives no sex-specific ages.** The thresholds "men under 55, women under 65" do not appear anywhere in the NG238 recommendations. The only age attached to family history is 60, for both sexes, through the QRISK3 input and the CG71 definition.

One rule, `ng238-family-history`:

| Step | Criterion (our words) |
| --- | --- |
| 1 | A first-degree relative has had angina or a heart attack |
| 2 | It happened before age 60 |

Outcome when met: **Worth discussing** only (it is an input to the clinician's assessment).

## Golden expectations on the sample pedigree

| Guideline | Expected in the brief | Result from the official text | Why |
| --- | --- | --- | --- |
| CG164 | Meets; evidence mother, maternal aunt, maternal grandmother | Meets; same evidence | Mother at 38 (`cg164-female-under-40`); mother and grandmother (`cg164-two-relatives`); mother and aunt (`cg164-breast-and-ovarian`) |
| Amsterdam II | No criteria met | No criteria met | Nobody has a Lynch-associated cancer |
| CG71 | Worth discussing; evidence father only | Worth discussing; evidence father only | Father's heart attack at 57 is before 60. The uncle is second-degree and never counts |
| DLCN family-history item | Not met | Not met | Father is male and 57; the threshold for men is 55 |
| NG238 | Not met (father 57, male threshold 55) | **Worth discussing; evidence father only** | NG238 has no threshold of 55 for men. Its family-history input is a first-degree relative before 60, either sex. Father at 57 meets it. **The golden expectation was changed for this reason.** |

## Thresholds and exclusions (comparison page)

Each rule also carries `thresholds` (its key threshold in plain words, its "before age N" limits, whether the person's own history counts, and the conditions it looks at) and `explainExclusions(ped)`, which lists every blood relative up to third degree with a relevant condition whom the rule does not count, with the reason. These add no criteria: the people a rule counts are read from the same step outcomes the finding uses, so nobody is both counted and excluded (tested on every case family).

Reasons are checked in this order and the first that applies is given: the condition is marked "not sure"; the person is the user and the rule does not count the user; the relative's degree is outside the rule; then the rule's own tests (sex, laterality, age threshold, in the rule's step order); otherwise "relevant, but the criteria as a whole are not all met" (or, for CG164's group criteria, "needs more relatives on the same side of the family"). A relative missing a detail the rule needs stays in the finding as possible evidence, so they appear as counted, never as excluded.

For DLCN, a relative of unknown sex is excluded only when their event is at or after both limits (60); before 55 they count, and from 55 to 59 they stay possible evidence.

## Wording rules for output

No output string contains "risk of", "%", "probability", "chance" or "likely". A test scans every string the engine can produce. Source titles that contain the word "risks" or "risk assessment" are quoted as titles only, and source titles are not shown on the findings or comparison pages (the DLCN title contains "underdiagnosed").

Rule and step sentences say "found before age N" rather than "diagnosed before age N", and the "Clinician confirms:" prefix moved from the step sentence to a tag beside it. The criteria are unchanged. A copy-lint test renders `/findings` and `/compare` for the sample family and fails on "risk of", "chance", "likely", "probability" or "diagnos" anywhere except the disclaimer, and on a percent sign anywhere except the completeness measure.
