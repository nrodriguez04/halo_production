/**
 * Jurisdiction research, gathered 2026-10-22 from public sources for all 50
 * states and DC (docs/markets.md s4). These are LEADS FOR COUNSEL, not legal
 * conclusions: each record cites what it relied on, marks its confidence,
 * and lists what counsel must still answer. Importing it fills market
 * drafts only; nothing here permits anything until counsel approves a
 * policy version. Regenerate it rather than editing it by hand.
 */
export const JURISDICTION_RESEARCH: readonly unknown[] = [
  {
    code: 'AL',
    name: 'Alabama',
    researchedAt: '2026-10-22',
    summary:
      "Alabama permits a buyer to assign or offer to assign its equitable interest in a single-family residential contract for a fee, provided it gives written disclosures. The subsequent purchaser must be told the nature of the interest, and the seller must be told of the intent to market before marketing begins and of any assignment's effective date at least three business days ahead (Act 2023-201, Ala. Code 8-42-1 to 8-42-3, effective August 1, 2023). Violations are a Class C misdemeanor with treble-fee civil liability. Bills to require AREC licensing of wholesalers (HB 397 in 2025, HB 586 in 2026) did not pass, and HB 586's synopsis states existing law does not require a license.",
    proposedClassification: 'B',
    classificationRationale:
      "Ala. Code 8-42-2 expressly allows assignment of an equitable interest for a fee on condition of written disclosures to the assignee and the seller, including advance notice of marketing and of the assignment date. The legislature's own 2026 synopsis states wholesalers currently need no AREC license, and the licensing bills failed. Unlicensed principal assignments therefore appear permitted with conditions.",
    regulator: {
      name: 'Alabama Real Estate Commission',
      url: 'https://arec.alabama.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Permitted if the statutory written disclosures are given (Ala. Code 8-42-2, single-family residential only). HB 586's 2026 synopsis describes existing law as allowing wholesalers to transfer equitable interests for a fee without AREC licensure.",
        sourceIds: ['s1', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration is required. HB 586 (2026) would have required AREC licensing of wholesalers and died on April 9, 2026; HB 397 (2025) also was not enacted.',
        sourceIds: ['s3', 's4'],
      },
      license_required_for_activity: {
        answer: 'no',
        note: 'Per the HB 586 synopsis, existing law does not require AREC licensing to assign equitable interests. No AREC position statement was found, and the license-law definitions (Ala. Code 34-27-2 and related sections) were not reviewed in full.',
        sourceIds: ['s3', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Ala. Code 8-42-2 (Act 2023-201). The disclosures cover assignment, novation or similar transfers of the interest. A violation is a Class C misdemeanor, and the violator may be liable to the person owed the disclosure for three times the fee received. Applies only to single-family residential property, and parties may otherwise agree by contract.',
        sourceIds: ['s1', 's2'],
        items: [
          {
            audience: 'buyer',
            description:
              "Written disclosure to any potential subsequent purchaser or assignee of the nature of the buyer's equitable interest.",
            timing: 'When offering or assigning the interest',
          },
          {
            audience: 'seller',
            description:
              "Written disclosure of the buyer's intent to market its equitable interest.",
            timing: 'Before commencing any marketing',
          },
          {
            audience: 'seller',
            description:
              'Written notice of the effective date of any assignment to a subsequent purchaser.',
            timing:
              'At least three business days before the assignment takes effect',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Marketing is permitted after written disclosure to the seller of the intent to market, and prospective purchasers must be told the nature of the equitable interest.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'The same disclosure conditions apply to any offer to assign.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: "Assignment requires prior written disclosures, including notice to the seller at least three business days before the assignment's effective date. Non-compliance is a misdemeanor with treble civil liability.",
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: "8-42-2(b) applies to transfers by assignment, novation or other similar method. Whether a double closing (taking title and reselling) is a 'similar method' is not addressed.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'The 2023 wholesaling statute provides no cancellation right; its remedies are criminal and treble-fee liability. HB 586 (2026) would have added rescission for certain unsolicited contracts but died. Other consumer statutes were not checked.',
        sourceIds: ['s1', 's3'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'The Alabama Secretary of State states that a foreign corporation must obtain a certificate of authority before transacting business ($150). The page reviewed addresses corporations; the foreign-LLC filing and Business Privilege Tax were not verified.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'SB 228 (2023 RS), enrolled; reported as Act 2023-201; Ala. Code 8-42-1 to 8-42-3',
        title:
          'Enrolled SB 228: residential real estate transactions (wholesaling disclosures; unfair service agreements)',
        url: 'https://alison.legislature.state.al.us/files/pdf/SearchableInstruments/2023RS/SB228-enr.pdf',
        type: 'bill',
        effectiveDate: '2023-08-01',
        summary:
          'Allows assignment of a single-family contract interest for a fee if written disclosures are made to the assignee and seller; violation is a Class C misdemeanor with treble-fee liability.',
      },
      {
        id: 's2',
        citation: 'Alabama REALTORS, June 23, 2023',
        title: 'REALTOR Advocacy Leads to New Law',
        url: 'https://www.alabamarealtors.com/posts/2023/06/23/realtoradvocacy-leads-to-new-law-',
        type: 'secondary',
        effectiveDate: '2023-08-01',
        summary:
          'Trade summary of Ala. Code 8-42-1 to -3, effective August 1, 2023, describing the three wholesaling disclosures and penalties.',
      },
      {
        id: 's3',
        citation: 'HB 586 (2026 RS), introduced',
        title: 'Alabama Property Deception Prevention Act (bill)',
        url: 'https://alison.legislature.state.al.us/files/pdf/SearchableInstruments/2026RS/HB586-int.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Synopsis says existing law lets wholesalers assign without AREC licensure; the bill would have required licensing and expanded disclosures.',
      },
      {
        id: 's4',
        citation: 'BillTrack50, AL HB586 (2026)',
        title: 'Alabama HB586 status',
        url: 'https://www.billtrack50.com/billdetail/1985469',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports HB 586 crossed over but was carried over to the call of the chair on April 8, 2026 and died on April 9, 2026.',
      },
      {
        id: 's5',
        citation: 'Alabama Secretary of State, Foreign Corporations',
        title: 'Foreign Corporations',
        url: 'https://www.sos.alabama.gov/business-entities/foreign-corporations',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'A foreign corporation must obtain a certificate of authority before transacting business; the filing fee is $150.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 586',
        session: '2026 RS',
        status:
          'Died April 9, 2026 after being carried over to the call of the chair (per BillTrack50).',
        url: 'https://www.billtrack50.com/billdetail/1985469',
        summary:
          'Would have required AREC licensing of wholesalers, expanded disclosures, required a fixed closing date, and given the Securities Commission concurrent jurisdiction.',
      },
      {
        bill: 'HB 397',
        session: '2025 RS',
        status:
          'Pending in House Boards, Agencies and Commissions after first reading (March 5, 2025) per search results; no enactment found.',
        url: 'https://legiscan.com/AL/bill/HB397/2025',
        summary:
          'Would have made non-disclosure in equitable-interest assignments a ground for AREC discipline.',
      },
    ],
    openQuestions: [
      'Confirm the Act number and governor approval date for SB 228 (2023), and the current codified text of Ala. Code 8-42-2.',
      "Does the 8-42-2 disclosure regime apply to double closings ('other similar method of transferring interest')?",
      'Does AREC take the position that repeated marketing of contract interests is brokerage under Ala. Code 34-27-2, despite the HB 586 synopsis?',
      'Do the disclosures apply to residential property other than single-family, such as 2-4 units or condos? The statute limits itself to single-family residential property.',
      'Expect reintroduction of the licensing bill in the 2027 session; monitor it.',
    ],
    activationSteps: [
      'Add a written disclosure to Alabama seller contracts stating intent to market the equitable interest, signed before any marketing begins.',
      'Add a disclosure to all Alabama investor-facing listings and assignment agreements stating the nature of the equitable interest (not the deed holder).',
      'Build a workflow that gives the seller written notice of the assignment effective date at least three business days before it takes effect.',
      'Register the LLC with the Alabama Secretary of State and confirm Business Privilege Tax obligations.',
    ],
    confidence: 'medium',
  },
  {
    code: 'AK',
    name: 'Alaska',
    researchedAt: '2026-10-22',
    summary:
      "Official Alaska statutes (AS 08.88) could not be retrieved in this pass, so findings rest on secondary sources. A 2026 secondary guide states that assigning one's own contract is not licensed activity and that licensing under AS 08.88.161 applies to acting for others, with civil penalties under AS 08.88.167. No Alaska wholesaling statute or Real Estate Commission guidance was found.",
    proposedClassification: 'E',
    classificationRationale:
      'Without the official text of AS 08.88 or any Commission guidance, the secondary claim that principal assignments are unregulated cannot be verified; classification E rather than a guess.',
    regulator: {
      name: 'Alaska Real Estate Commission',
      url: null,
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "A secondary source asserts assigning one's own contract is not licensed activity and that AS 08.88.161 licensing covers acting for others; the official statute text was not retrieved.",
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; official sources not reviewed.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'Secondary source only: licensing applies to selling, listing or negotiating real estate for others; penalties under AS 08.88.167 reported as up to $5,000 or gain plus $5,000 per offense.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not verified; the secondary source suggests marketing the property for its owner is the licensing line.',
        sourceIds: [],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: 'Not verified against official sources.',
        sourceIds: [],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'Secondary sources: a foreign LLC must obtain a certificate of registration from the Division of Corporations before conducting affairs (AS 10.50.600-.720), maintain an Alaska registered agent, and hold an Alaska business license (AS 43.70).',
        sourceIds: ['s2', 's3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'The Squatters Crew, Real Estate Wholesaling Laws by State (July 9, 2026)',
        title: 'Wholesaling laws by state',
        url: 'https://squatters.onrender.com/blog/wholesaling-laws-by-state',
        type: 'secondary',
        effectiveDate: null,
        summary:
          "Non-authoritative guide asserting Alaska licensing under AS 08.88.161 covers acting for others and does not reach assigning one's own contract.",
      },
      {
        id: 's2',
        citation: 'Ezel, Alaska foreign LLC registration requirements',
        title:
          'Alaska: Foreign LLC Registration and Qualification Requirements',
        url: 'https://ezel.ai/surveys/foreign-llc-registration-requirements/alaska',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports that foreign LLCs register under AS 10.50.600-.720 before conducting affairs, must keep an Alaska registered agent, and face penalties if unregistered.',
      },
      {
        id: 's3',
        citation: 'Harbor Compliance, Alaska Business License',
        title: 'Alaska Business License',
        url: 'https://www.harborcompliance.com/alaska-business-license',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports that an Alaska business license under AS 43.70 is required to engage in business in the state.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Obtain and review the official text of AS 08.88.161, 08.88.900 and 08.88.990 (broker definition and owner or own-behalf exceptions).',
      'Does the Alaska Real Estate Commission have any position on wholesaling or assignment of purchase contracts?',
      'Verify foreign LLC registration and business license requirements with the Division of Corporations, Business and Professional Licensing.',
    ],
    activationSteps: [
      'Have Alaska counsel review AS 08.88 before launch.',
      'Register the foreign LLC with the Alaska Division of Corporations and obtain an Alaska business license.',
    ],
    confidence: 'low',
  },
  {
    code: 'AZ',
    name: 'Arizona',
    researchedAt: '2026-10-22',
    summary:
      'Arizona does not license or register wholesalers, but A.R.S. 44-5101 (Laws 2022, ch. 170, HB 2747) requires written status disclosures for residential property (fewer than five units) before any binding agreement. A wholesale buyer must tell the seller it is a wholesale buyer, and a wholesale seller must tell the end buyer it holds only an equitable interest and may not be able to convey title. If the disclosure is missing, the other party may cancel before close of escrow without penalty. ADRE has said wholesalers need no license unless they represent a buyer or seller for compensation.',
    proposedClassification: 'B',
    classificationRationale:
      "Unlicensed principal assignments are permitted (ADRE guidance and the license-law 'for another' structure), but subject to statutory written disclosures to both seller and end buyer with a cancellation remedy for non-disclosure. Those are conditions rather than a license requirement, so B fits.",
    regulator: {
      name: 'Arizona Department of Real Estate',
      url: 'https://azre.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "ADRE states individuals engaged in wholesaling need no license if they are not engaged in brokerage, meaning representing a buyer or seller for compensation. 44-5101 assumes and regulates the practice through disclosures rather than licensing. The ADRE page was seen in search results but returned 404 on 2026-10-22; counsel should confirm ADRE's current position.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration found; 44-5101 imposes only disclosure duties and private cancellation remedies.',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "No license is needed for wholesaling absent representation of a party for compensation (ADRE). The broker definition in 32-2101 covers acts for another, including dealing in options. The entity-owner exemption in 32-2121(A)(1) applies only if there is no special compensation and a majority of officers' or members' activities are not broker acts, which matters for a business that buys and resells. No frequency threshold was found. ADRE also notes licensees who wholesale must disclose their license status.",
        sourceIds: ['s2', 's3', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: "A.R.S. 44-5101 applies to residential real property with fewer than five dwelling units. 'Wholesale buyer' and 'wholesale seller' are defined by reference to assigning the purchase contract to another person.",
        sourceIds: ['s1', 's2', 's5'],
        items: [
          {
            audience: 'seller',
            description:
              'Written disclosure to the seller that the buyer is a wholesale buyer.',
            timing: 'Before the parties enter into any binding agreement.',
          },
          {
            audience: 'buyer',
            description:
              'Written disclosure to the end buyer that the seller is a wholesale seller holding an equitable interest in the property and may not be able to convey title.',
            timing: 'Before the parties enter into any binding agreement.',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'ADRE describes wholesaling as marketing and selling an assignment of the contract and says no license is needed absent representation, which supports marketing the contract interest. The enacted 44-5101 text contains no advertising rules (one secondary source claims it limits advertising; the session law reviewed does not). Advertising the property as if listing it for the owner would be brokerage under 32-2101 (inference).',
        sourceIds: ['s1', 's2', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Permitted as marketing of the contract assignment, with the wholesale-seller disclosure delivered in writing before any binding agreement with the investor.',
        sourceIds: ['s1', 's2'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No prohibition or consent requirement; assignment of a residential purchase contract triggers the 44-5101 written disclosures, and non-disclosure gives the counterparty a pre-closing cancellation right.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Reselling property one owns falls under the 32-2121(A)(1) owner exemption, subject to its no-special-compensation and majority-of-activities limits. Because 44-5101 defines wholesale buyers and sellers by assignment, a true buy-then-resell may fall outside its disclosure duty; not confirmed.',
        sourceIds: ['s1', 's4'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only if the wholesale buyer fails to make the written disclosure: the seller may then cancel at any time before close of escrow without penalty and keep any earnest money. A buyer has the mirror right, with an earnest money refund, if the wholesale seller fails to disclose. There is no cancellation right when the disclosures are made, and no fixed number of days.',
        sourceIds: ['s1', 's5'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found; local rules were not specifically researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must file a foreign registration statement with the Arizona Corporation Commission (Form L025) and appoint an Arizona statutory agent before transacting business.',
        sourceIds: ['s6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'A.R.S. 44-5101, added by Laws 2022, ch. 170 (HB 2747)',
        title:
          'Wholesale buyers; wholesale sellers; disclosure; unlawful practice; definitions (session law, approved 2022-04-22)',
        url: 'https://www.azleg.gov/legtext/55leg/2r/laws/0170.htm',
        type: 'bill',
        effectiveDate: '2022-09-24',
        summary:
          'Requires wholesale buyers and sellers of residential property to make written status disclosures before a binding agreement and gives the other party a pre-closing cancellation right if they do not.',
      },
      {
        id: 's2',
        citation: 'Arizona Department of Real Estate',
        title: "Arizona's New Wholesaling Disclosure Requirement",
        url: 'https://azre.gov/node/713',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'ADRE says wholesalers need no license unless they represent a buyer or seller for compensation, and that licensees who wholesale must disclose license status (seen in search results; page returned 404 on 2026-10-22).',
      },
      {
        id: 's3',
        citation: 'A.R.S. 32-2101',
        title: 'Definitions (real estate broker, para. 51)',
        url: 'https://www.azleg.gov/ars/32/02101.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a real estate broker as one who, for another and for compensation, sells, buys, lists, negotiates, deals in options, or advertises real estate services.',
      },
      {
        id: 's4',
        citation: 'A.R.S. 32-2121',
        title: 'Application of article; exemptions',
        url: 'https://www.azleg.gov/ars/32/02121.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Exempts owners, including entities, dealing in their own property if there is no special compensation and most officers' or members' activities are not broker acts.",
      },
      {
        id: 's5',
        citation: 'Greater Phoenix In Business Magazine (2022-05-05)',
        title: 'New Laws for Real Estate Investors and Wholesalers',
        url: 'https://inbusinessphx.com/?p=170525',
        type: 'secondary',
        effectiveDate: null,
        summary:
          "Explains HB 2747's wholesale buyer and seller disclosures and the cancellation and earnest money consequences of non-disclosure.",
      },
      {
        id: 's6',
        citation: 'Arizona Corporation Commission, Form L025',
        title: 'Application for Registration (foreign LLC)',
        url: 'https://www.azcc.gov/docs/default-source/corps-files/forms/l025-application-for-registration.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLC registration form filed with the Corporation Commission, naming an Arizona statutory agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does 44-5101 apply when Hālo double closes rather than assigns? Its definitions turn on assigning the contract.',
      'When must the wholesale-buyer disclosure be made if Hālo has not decided whether to assign or close? (Conservative answer: always disclose.)',
      "What is ADRE's current published position on wholesaling? The 2022 guidance page returned 404 on 2026-10-22.",
      'Does a business whose main activity is buying and reselling satisfy the 32-2121(A)(1) majority-of-activities limit for its officers and members?',
      "Is a violation of 44-5101 also an unlawful practice under the Consumer Fraud Act? The section title says 'unlawful practice' but the reviewed text gives only private cancellation remedies.",
    ],
    activationSteps: [
      'Insert the written wholesale-buyer disclosure into every Arizona residential offer (for example in the additional terms) before it is conveyed to the seller.',
      'Insert the written wholesale-seller disclosure (equitable interest only; may not be able to convey title) into every assignment offer and deal listing before any binding agreement with an investor.',
      'Market the contract assignment only; do not represent or negotiate for the seller or the end buyer.',
      'File a foreign registration statement (Form L025) with the Arizona Corporation Commission and appoint an Arizona statutory agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'AR',
    name: 'Arkansas',
    researchedAt: '2026-10-22',
    summary:
      'Arkansas has no wholesaling-specific statute. The Real Estate Commission treats unlicensed wholesaling as unlicensed real estate activity: in a 2015 hearing it held that a contract buyer marketing its equitable interest did not qualify for the owner exemption, and its December 2025 newsletter warns against wholesaling. The licensing exemptions cover owners of freehold or leasehold interests and those acquiring for their own use, and 17-42-104(c) removes exemptions for strategic circumvention. A 2023 bill (SB 553) to create a wholesale disclosure regime and ban unlicensed public marketing was not enacted.',
    proposedClassification: 'C',
    classificationRationale:
      "The regulator's precedent and current guidance treat marketing or assigning an equitable interest for profit without a license as unlicensed activity. The statutory owner exemption is limited to freehold or leasehold owners and to individuals acquiring for their own use, and 17-42-104(c) denies exemptions to those who strategically circumvent licensure. Licensing or licensed-broker participation should be assumed necessary for the intended activities.",
    regulator: {
      name: 'Arkansas Real Estate Commission',
      url: 'https://arec.arkansas.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'no',
        note: 'This is conservative and should be confirmed by counsel. In the Stassi hearing (2015), AREC held that an unlicensed contract buyer with a right to market its equitable interest did not qualify for the owner exemption and fined her $5,000. Current 17-42-104(a)(1) exempts owners of freehold or leasehold interests and those acquiring for their own use, and (c) removes exemptions for strategic circumvention. A single, unmarketed assignment is not squarely addressed.',
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration regime exists. SB 553 (2023) would have created a wholesale disclosure act but was not enacted, and the current license law contains no wholesaler registration.',
        sourceIds: ['s1', 's4'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'AREC states that selling or marketing real property, or negotiating its sale, for another for compensation requires an active license, and it treats wholesalers as a target of enforcement. No frequency threshold was found.',
        sourceIds: ['s3', 's2', 's1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No enacted wholesaling disclosure statute was found; the SB 553 disclosure provisions were not enacted.',
        sourceIds: ['s4'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'AREC treats marketing real estate for another for compensation as licensed activity, and found unlicensed activity where a contract buyer marketed its equitable interest.',
        sourceIds: ['s2', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: "Not addressed in any source found. Given AREC's position, assume it requires a license until counsel advises otherwise.",
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statute restricting assignment of residential purchase contracts as such was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'This is a lead only. The exemption covers an owner of a freehold interest, so reselling after a genuine acquisition of title is arguably exempt. However, 17-42-104(c) denies exemptions where licensure is strategically circumvented, which could reach sham simultaneous closings.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None enacted was found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'The Arkansas Secretary of State forms page lists foreign LLC filing types and annual reports or franchise tax for foreign entities. The specific foreign-LLC statute and fee were not retrieved, and state tax registration was not researched.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Ark. Code Ann. 17-42-103(10), 17-42-104 (AREC license law compilation, Aug. 2025)',
        title: 'Arkansas Real Estate License Law',
        url: 'https://arec.arkansas.gov/wp-content/uploads/AR-Real-Estate-License-Law-April-2026.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Broker acts are those done for another for a fee. Exemptions cover freehold or leasehold owners and own-use acquirers, but are lost for certain equitable-interest dealings or strategic circumvention.',
      },
      {
        id: 's2',
        citation:
          'AREC Formal Hearing #3392, In re Lisa Stassi (Apr. 13, 2015)',
        title: 'Stassi, Lisa - disciplinary action',
        url: 'https://arec.arkansas.gov/hearing_disciplinary/stassi-lisa/',
        type: 'case',
        effectiveDate: null,
        summary:
          'An unlicensed contract buyer marketing its equitable interest was held not exempt as an owner and was fined for unlicensed activity.',
      },
      {
        id: 's3',
        citation: 'AREC Newsletter, December 2025',
        title: 'The Dangers of Wholesale Real Estate Practices in Arkansas',
        url: 'https://arec.arkansas.gov/wp-content/uploads/AR-Real-Estate-Commission-Newsletter-DEC-2025-updated.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'AREC warns that marketing or selling real property for another for compensation requires a license and that wholesalers face enforcement.',
      },
      {
        id: 's4',
        citation: 'SB 553 (2023 RS)',
        title: 'Arkansas Real Estate Wholesale Consumer Protection Act (bill)',
        url: 'https://www.arkleg.state.ar.us/assembly/2023/2023R/Bills/SB553.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Proposed to bar unlicensed public marketing of contract interests and require wholesale buyer and seller disclosures; it was not enacted.',
      },
      {
        id: 's5',
        citation:
          'Arkansas Secretary of State, Business and Commercial Services Forms and Fees',
        title: 'Forms & Fees',
        url: 'https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Lists LLC filing types, including foreign filings, and annual report or franchise tax obligations.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'SB 553',
        session: '2023 RS',
        status:
          'Reported in search results as died in Senate committee at sine die adjournment (May 1, 2023); its provisions are absent from the current license law.',
        url: 'https://www.arkleg.state.ar.us/assembly/2023/2023R/Bills/SB553.pdf',
        summary:
          'Would have barred unlicensed public marketing of contract interests and created wholesale buyer and seller disclosures with termination rights.',
      },
    ],
    openQuestions: [
      "Would AREC treat a principal's single, unmarketed assignment to a known investor as unlicensed activity?",
      "Does 17-42-104(c)(1) (an equitable interest obtained 'on behalf of' another) apply to wholesalers who intend to assign?",
      'Is a funded double closing (wholesaler takes title with its own funds) protected by the freehold-owner exemption?',
      'Has Arkansas introduced wholesaling legislation in 2025 or 2026? None was found, but the search was limited.',
    ],
    activationSteps: [
      'Do not run unlicensed assignment wholesaling in Arkansas; partner with an Arkansas principal broker or obtain a license.',
      'Alternatively, use a genuine principal purchase and resale with funded acquisition, pending counsel review of 17-42-104(c).',
      'Register the LLC with the Arkansas Secretary of State and calendar annual report and franchise tax filings.',
    ],
    confidence: 'medium',
  },
  {
    code: 'CA',
    name: 'California',
    researchedAt: '2026-10-22',
    summary:
      'California has no wholesaler-specific statute in force as found; the broker definition (Bus. & Prof. Code 10131) covers acts done for another or others for compensation. AB 1850 (2026) would have required a real estate license and title disclosures for wholesaling, but its last recorded action was being held under submission in committee on 2026-05-14. Residences in foreclosure trigger the Home Equity Sales Contract Act, which gives the seller a five-business-day cancellation right and bars the purchaser from transferring its interest during that period.',
    proposedClassification: 'B',
    classificationRationale:
      'On the statutory text, an unlicensed principal acting only for its own account falls outside the broker definition, and no wholesaling registration or license statute is in force. Conditions arise for owner-occupied residences in foreclosure (equity purchaser contract rules, cancellation right, transfer bar). Because no DRE guidance on assignments or public marketing was found and AB 1850 shows legislative appetite to license wholesalers, confidence is low and counsel must confirm marketing practices.',
    regulator: {
      name: 'California Department of Real Estate',
      url: 'https://www.dre.ca.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Bus. & Prof. Code 10131 defines a broker by acts performed for another or others for compensation; no statute found that regulates a principal assigning its own purchase contract. The answer holds only while the company acts solely for itself (no soliciting sellers or buyers on another's behalf, no negotiating for others). AB 1850 would have changed this but was not enacted as of its last recorded action.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration statute found. AB 1850 (2025-2026) proposed a license requirement for wholesaling; last recorded action 2026-05-14, held under submission in committee.',
        sourceIds: ['s2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Not required by statute for pure principal assignments as found; required for any act done for another for compensation (soliciting sellers or buyers, negotiating, listing). No frequency threshold found. If AB 1850 or a successor is enacted, all wholesaling would require a license.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'conditional',
        note: "No general wholesaling disclosure statute in force. If the property is an owner-occupied 1-4 unit residence with a recorded notice of default, the Home Equity Sales Contract Act (Civ. Code 1695 et seq.) governs the purchase contract, including the seller's cancellation right. AB 1850 would have required written no-title disclosures to owners and in advertising.",
        sourceIds: ['s3', 's4', 's2'],
        items: [
          {
            audience: 'seller',
            description:
              "Equity purchase contract requirements and notice of the seller's statutory cancellation right under Civ. Code 1695 et seq. when the property is a residence in foreclosure (exact form and wording to be confirmed by counsel).",
            timing:
              "In the purchase contract, before or at the seller's signature",
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'No DRE guidance found. An investor-industry guide (2024) claims unlicensed wholesalers who advertise properties risk penalties, without citing a statute. AB 1850 would have required advertisements to disclose that the advertiser lacks legal title.',
        sourceIds: ['s2', 's6'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: "No official source addresses private marketing of a contract interest to known investors. An investor-industry guide (2024) asserts that offering one's contract privately to buyers, without marketing, is legal; not verified against any official source.",
        sourceIds: ['s6'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: "No general statutory consent, notice or prohibition on assigning a residential purchase contract was found. For residences in foreclosure, the equity purchaser may not transfer or encumber its interest to a third party until the seller's cancellation period has run (Civ. Code 1695.4).",
        sourceIds: ['s3'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Buying and reselling for the company's own account is not an act for another under 10131, so it appears lawful without a license; the equity purchaser rules (contract formalities, cancellation period, transfer bar) apply if the property is a residence in foreclosure. Counsel to confirm.",
        sourceIds: ['s1', 's3', 's4'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: "Only for residences in foreclosure (owner-occupied 1-4 units with a recorded notice of default): the equity seller may cancel until midnight of the fifth business day after signing, or until 8 a.m. on the scheduled trustee's sale day, whichever is first. No cancellation right found for ordinary wholesale contracts.",
        sourceIds: ['s3', 's4'],
        deadline: {
          days: 5,
          businessDays: true,
          trigger:
            "after the equity seller signs a compliant contract (or until 8 a.m. on the scheduled trustee's sale day, if earlier)",
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must register with the Secretary of State before transacting intrastate business (Corp. Code 17708.02; Form LLC-5), with a California registered agent and a certificate of good standing issued within six months; registration triggers the annual LLC tax under Rev. & Tax. Code 17941.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Cal. Bus. & Prof. Code 10131',
        title:
          'Business and Professions Code section 10131 (real estate broker defined)',
        url: 'https://california.public.law/codes/ca_bus_and_prof_code_section_10131',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a real estate broker as a person who, for compensation, performs listed acts such as selling, buying, soliciting or negotiating for another or others.',
      },
      {
        id: 's2',
        citation: 'AB 1850 (Cal. 2025-2026 Reg. Sess.)',
        title:
          'AB 1850, Real estate: wholesaling (Digital Democracy bill page)',
        url: 'https://calmatters.digitaldemocracy.org/bills/ca_202520260ab1850',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would require a real estate license for wholesaling and written no-title disclosures to owners and in ads; last recorded action 2026-05-14, held under submission in committee.',
      },
      {
        id: 's3',
        citation: 'Cal. Civ. Code 1695.4',
        title: "Civil Code section 1695.4 (equity seller's right to cancel)",
        url: 'https://california.public.law/codes/civil_code_section_1695.4',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Gives the equity seller of a residence in foreclosure a cancellation right through the fifth business day after signing and bars the equity purchaser from transferring its interest meanwhile.',
      },
      {
        id: 's4',
        citation: 'Cal. Civ. Code 1695.1',
        title:
          'Civil Code section 1695.1 (Home Equity Sales Contract Act definitions)',
        url: 'https://california.public.law/codes/civil_code_section_1695.1',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines residence in foreclosure as an owner-occupied 1-4 unit home with a recorded notice of default and defines equity purchaser with listed exclusions.',
      },
      {
        id: 's5',
        citation: 'Cal. Corp. Code 17708.02',
        title: 'Corporations Code section 17708.02 (foreign LLC registration)',
        url: 'https://california.public.law/codes/corporations_code_section_17708.02',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to apply to the Secretary of State to register before transacting intrastate business, naming a California agent and attaching a recent good-standing certificate.',
      },
      {
        id: 's6',
        citation:
          'BatchLeads, A Complete Guide To Wholesaling Real Estate In California (May 10, 2024)',
        title: 'A Complete Guide To Wholesaling Real Estate In California',
        url: 'https://batchleads.io/blog/a-complete-guide-to-wholesaling-real-estate-in-california',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Investor-industry guide claiming private contract assignments are legal unlicensed but advertising properties without a license risks penalties; cites no specific statute.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'AB 1850',
        session: '2025-2026',
        status:
          'Held under submission in committee (last recorded action 2026-05-14); no later action found in this research pass.',
        url: 'https://calmatters.digitaldemocracy.org/bills/ca_202520260ab1850',
        summary:
          'Would add wholesaling to the broker definition, prohibit wholesaling without a real estate license, and require written disclosures to owners and in ads that the wholesaler will not take or does not hold title.',
      },
    ],
    openQuestions: [
      'Confirm AB 1850 died with the 2025-2026 session and whether a successor bill is expected in 2027.',
      "Does the DRE treat an unlicensed principal's public advertising of a property it holds only under contract as soliciting buyers for the owner under Bus. & Prof. Code 10131?",
      'Does the Home Equity Sales Contract Act apply when the wholesaler assigns rather than takes title, and what exact contract notices (Civ. Code 1695.3, 1695.5) are required?',
      'Are there city or county ordinances (for example in Los Angeles or San Francisco) affecting residential purchase solicitations or assignments?',
    ],
    activationSteps: [
      'Register the LLC with the California Secretary of State (Form LLC-5), appoint a California registered agent, and budget for the annual LLC tax.',
      'Operate strictly as principal: no listing, negotiating or soliciting on behalf of sellers or end buyers.',
      'Screen every lead for a recorded notice of default; either decline those deals or use counsel-approved equity purchase contracts with the five-business-day cancellation notice and no transfer during the cancellation period.',
      'Have California counsel approve all public marketing of contract interests, or route public marketing through a California-licensed broker.',
      'Monitor the 2027 session for a successor to AB 1850.',
    ],
    confidence: 'low',
  },
  {
    code: 'CO',
    name: 'Colorado',
    researchedAt: '2026-10-22',
    summary:
      "No Colorado wholesaling statute or Division of Real Estate guidance was found. Colorado's broker definition (C.R.S. 12-10-201(6)(a)) covers selling, buying, negotiating and dealing in options for compensation by any single act, without a 'for another' limit, and defines option dealers. Exemptions cover a principal acquiring an interest and natural persons or LLC managers selling property owned, leaving the position of a contract purchaser who assigns for a fee unclear.",
    proposedClassification: 'E',
    classificationRationale:
      "The statutory text is broader than most states' and the available exemptions refer to acquiring interests or selling property owned, so whether an unlicensed assignment or marketing of a purchase contract is lawful cannot be determined from the sources found. No regulator guidance or case was located; classification E rather than a guess.",
    regulator: {
      name: 'Colorado Division of Real Estate',
      url: 'https://dre.colorado.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "C.R.S. 12-10-201(6)(a) applies to anyone who, for compensation, sells, offers to sell or deals in options on real estate by a single act, with no 'for another' limit; (6)(b)(IV) exempts a principal acquiring an interest and (6)(b)(VII) covers natural persons and LLC managers selling property owned. Whether the assignment of a purchase contract qualifies is unresolved.",
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'A single act suffices under 12-10-201(6)(a); the option-dealer definition reaches persons who take options intending to sell to others. Treat as high risk pending counsel review.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found; offering to sell real estate for compensation is listed broker activity.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "After taking title, a resale by a natural person who is the LLC's manager or a 20%+ owner authorized to sell LLC-owned property falls within the (6)(b)(VII) exemption on its text; application to a business that buys to resell immediately should be confirmed.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: "No cancellation right for ordinary wholesale contracts was found; whether Colorado's foreclosure-protection statutes apply to purchases of homes in foreclosure was not verified.",
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign entity may not transact business until its statement of foreign entity authority is filed with the Secretary of State (C.R.S. 7-90-801); civil penalty up to $5,000 for transacting business without it.',
        sourceIds: ['s2', 's3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'C.R.S. 12-10-201',
        title:
          'C.R.S. 12-10-201 - Definitions (real estate broker, option dealer)',
        url: 'https://colorado.public.law/statutes/crs_12-10-201',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker by acts done for compensation by a single act or course of conduct, defines option dealer, and lists principal and owner exemptions.',
      },
      {
        id: 's2',
        citation: 'C.R.S. 7-90-801',
        title:
          'C.R.S. 7-90-801 - Authority to transact business or conduct activities',
        url: 'https://colorado.public.law/statutes/crs_7-90-801',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Bars a foreign entity from transacting business until its statement of foreign entity authority is filed; sets a civil penalty.',
      },
      {
        id: 's3',
        citation: 'Colorado Secretary of State, Foreign business entities FAQ',
        title: 'Foreign (outside of Colorado) business entities',
        url: 'https://coloradosos.gov/pubs/business/FAQs/foreigns.html',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Explains that entities formed outside Colorado file a Statement of Foreign Entity Authority to transact business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does the Division of Real Estate or the Real Estate Commission have a position statement on wholesaling or assignment of purchase contracts?',
      "Does a contract purchaser's assignment fall within the (6)(b)(IV) principal exemption, or is it selling real estate for compensation requiring a license?",
      "Do Colorado's foreclosure-protection statutes give sellers cancellation rights in purchases of homes in foreclosure?",
      'Any Denver or other municipal rules on residential purchase solicitations?',
    ],
    activationSteps: [
      'Do not launch Colorado until counsel resolves the licensing question.',
      'File a Statement of Foreign Entity Authority with the Colorado Secretary of State.',
      'Consider a Colorado-licensed broker partner, or a buy-then-resell model with resale handled by an authorized natural-person manager.',
    ],
    confidence: 'low',
  },
  {
    code: 'CT',
    name: 'Connecticut',
    researchedAt: '2026-10-22',
    summary:
      "Public Act 25-168 (sections 252-259), codified as Conn. Gen. Stat. chapter 392a (20-329aaa et seq.), took effect July 1, 2026. No person may act as a real estate wholesaler without a Department of Consumer Protection registration ($285, two-year term). From October 1, 2026 the seller must receive DCP's written wholesale disclosure report before signing. The seller may cancel within three business days, closing must be set within 90 days, wholesalers may not record the contract or liens, and assignees must get written notice of the wholesaler's status; violations are CUTPA violations.",
    proposedClassification: 'C',
    classificationRationale:
      'Connecticut requires a wholesaler-specific DCP registration for anyone acting as a real estate wholesaler, with no single-deal or frequency exemption found, so the intended activity cannot proceed without registration. Once registered, the activity is permitted with conditions (disclosure report, 3-business-day cancellation, 90-day closing cap, no recording, notice to assignee). A real estate license does not appear to be required by chapter 392a itself.',
    regulator: {
      name: 'Connecticut Department of Consumer Protection',
      url: 'https://portal.ct.gov/wholesaling',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Chapter 392a requires DCP wholesaler registration, not a real estate license, to act as a wholesaler (a person who contracts to facilitate the sale of a seller's residential property to a third party without taking title). Assignment without a license appears allowed only for a registered wholesaler that follows the chapter's conditions.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'yes',
        note: 'From July 1, 2026, no person may act as a real estate wholesaler without DCP registration; the fee is $285 and registrations expire July 31 of even years. DCP says this applies even to licensed brokers and salespersons.',
        sourceIds: ['s1', 's2', 's3'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Registration, not a broker license, is the chapter 392a requirement. No frequency threshold or single-transaction exemption was found. Whether wholesaling activity can also count as brokerage under the general real estate licensing law was not resolved.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Disclosure report developed by DCP (posted by September 30, 2026, PDF dated June 2026) must be given to the seller before contract execution on and after October 1, 2026; separate written notice to any assignee.',
        sourceIds: ['s1', 's2', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              "DCP written wholesale disclosure report covering fair market value, wholesaler profit expectations, property access, closing costs and the seller's cancellation right, confirming the wholesaler's status.",
            timing:
              'Before executing the real estate wholesale contract (required on and after 2026-10-01); delivered electronically or in person',
          },
          {
            audience: 'buyer',
            description:
              'Written notice to the third-party assignee identifying the seller of the contract as a real estate wholesaler holding a future interest but not title.',
            timing: 'When selling or assigning the contract to the third party',
          },
          {
            audience: 'seller',
            description:
              'Contract must state a closing date no more than 90 days after the contract date; extensions only in writing signed by all parties.',
            timing: 'In the original wholesale contract',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Chapter 392a contains no explicit advertising restriction, and the seller disclosure acknowledges the wholesaler may market the property, but only a registered wholesaler may act as one. Unregistered marketing would itself be acting as a wholesaler.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Permitted for a registered wholesaler, with the written assignee notice. No separate rule on outreach to known investors was found.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: "Assignee must get written notice of the wholesaler's status; the contract must close within 90 days unless extended in writing by all parties, or it ends; no lien, encumbrance or recording of the contract is allowed, and any such recording is void.",
        sourceIds: ['s1', 's2'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The wholesaler definition covers facilitating a sale without assuming title, so a genuine purchase in which the company takes title and then resells appears outside chapter 392a. Counsel must confirm, especially for same-day double closes.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: 'The seller may cancel for any reason, or none, within three business days without penalty; the only obligation is returning any deposit the wholesaler paid.',
        sourceIds: ['s1', 's2'],
        deadline: {
          days: 3,
          businessDays: true,
          trigger: 'after the seller enters into the wholesale contract',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC files a Foreign Registration Statement with the Secretary of the State and keeps a Connecticut registered agent; secondary sources report a $120 fee. DCP wholesaler registration is separate.',
        sourceIds: ['s4', 's5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Conn. Gen. Stat. 20-329aaa to 20-329hhh (chapter 392a), from P.A. 25-168 sections 252-259',
        title: 'Chapter 392a - Real Estate Wholesalers (2026 Supplement)',
        url: 'https://prdext3.cga.ct.gov/2026/sup/chap_392a.htm',
        type: 'statute',
        effectiveDate: '2026-07-01',
        summary:
          'Creates DCP wholesaler registration, seller disclosure report, 3-business-day seller cancellation, 90-day closing cap, recording prohibition, assignee notice, and CUTPA enforcement.',
      },
      {
        id: 's2',
        citation: 'Connecticut Department of Consumer Protection',
        title: 'Real Estate Wholesaling',
        url: 'https://portal.ct.gov/wholesaling',
        type: 'regulator_guidance',
        effectiveDate: '2026-07-01',
        summary:
          'DCP page stating that all wholesalers, including licensees, must register and describing the disclosure report, cancellation right, 90-day rule and lien prohibition.',
      },
      {
        id: 's3',
        citation: 'DCP news release, June 25, 2026',
        title: 'Real Estate Wholesalers Required to Register with DCP',
        url: 'https://portal.ct.gov/dcp/news-releases-from-the-department-of-consumer-protection/2026-news-releases/real-estate-wholesalers-required-to-register-with-dcp',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Announces registration opening July 1, 2026, the $285 fee and biennial July 31 expiry, and the seller disclosure requirement.',
      },
      {
        id: 's4',
        citation: 'Connecticut Secretary of the State, Business Services',
        title: 'Foreign Registration Statement - LLC (form)',
        url: 'https://business.ct.gov/-/media/SOTS/Business-Services/BSD-Forms/Limited-Liability-Company/Foreign/Foreign_Registration_Statement_LLC_Foreign_FILLABLE_20220127.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Official form a foreign LLC files to register in Connecticut, including its Connecticut registered agent.',
      },
      {
        id: 's5',
        citation: 'LLC Buddy guide',
        title: 'How to Start a Foreign LLC in Connecticut',
        url: 'https://llcbuddy.com/connecticut-llc/connecticut-foreign-llc/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide reporting the $120 foreign registration fee and the registered agent requirement.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does an entity registration cover its employees, or must each individual acquisitions agent register?',
      'Can wholesaling activity also be treated as brokerage under the general real estate licensing statute, requiring a license in addition to DCP registration?',
      'Exact content and delivery requirements of the DCP disclosure report, and treatment of contracts signed between July 1 and October 1, 2026.',
      "Does the 3-business-day period run from the seller's signature or from full execution, and how does it interact with the 90-day closing cap and any assignment?",
      'Does chapter 392a reach a same-day double close where the company briefly takes title?',
    ],
    activationSteps: [
      'Register the operating entity (and any required individuals) as a real estate wholesaler with DCP through eLicense before any Connecticut activity.',
      'Deliver the current DCP wholesale disclosure report to each seller before contract signing and keep proof of delivery.',
      'Use a Connecticut contract template with a closing date within 90 days, the 3-business-day cancellation right, and no recording of memoranda or liens.',
      'Give every assignee the written wholesaler-status notice before assignment.',
      'File a Foreign Registration Statement with the Secretary of the State and appoint a registered agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'DE',
    name: 'Delaware',
    researchedAt: '2026-10-22',
    summary:
      "SB 201 (85 Del. Laws c. 274), signed June 1, 2026, defines wholesaling (marketing and advertising the assignment of an equitable interest in 1-4 family residential property or a residential lot) and limits the owner exemption to owners not engaged in wholesaling as a business, both effective on enactment. New section 2940 requires a Commission-approved Disclosure for Wholesale Transactions (in English, Spanish and Haitian Creole) and gives sellers a non-waivable 21-calendar-day cancellation right, effective about August 30, 2026. Wholesaling becomes a licensed 'real estate service' on February 26, 2027.",
    proposedClassification: 'C',
    classificationRationale:
      'From February 26, 2027 wholesaling and attempts to engage in a wholesale transaction are real estate services requiring a Delaware license, and the owner exemption already excludes those engaged in wholesaling as a business, so the intended activity needs licensure. Conditions (disclosure form, 21-day cancellation, refunds) also apply. Unlicensed operation between now and February 2027 is legally ambiguous and should not be relied on.',
    regulator: {
      name: 'Delaware Real Estate Commission (Division of Professional Regulation)',
      url: 'https://dpr.delaware.gov/boards/realestate/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Not after 2027-02-26, when wholesaling becomes a licensed real estate service. Before then the status is ambiguous: wholesaling is defined and the owner exemption excludes those wholesaling as a business (effective 2026-06-01), but wholesaling is not yet listed as a real estate service. Treat as 'no' for planning.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No separate registration; the law uses real estate licensure.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: "Effective 2027-02-26 (270 days after enactment), real estate services include wholesaling or attempts to engage in a wholesale transaction, whether for oneself or others. No numeric threshold; the owner exemption is lost by anyone engaged in wholesaling 'as a business'.",
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'yes',
        note: "New section 2940, effective 90 days after June 1, 2026 (about 2026-08-30); the Commission has published a 'Disclosure for Wholesale Transactions' form (link returned 404 when checked). The section is phrased in terms of the licensee.",
        sourceIds: ['s1', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Commission-approved Disclosure for Wholesale Transactions, available in English, Spanish and Haitian Creole, stating the agreement is a wholesale transaction in which the interest will be assigned or sold for a fee, the right to an appraisal or independent advice, the 21-day cancellation right, and refund within 10 business days.',
            timing: 'Before or when the seller executes the agreement',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Wholesaling is defined as marketing and advertising for the assignment of an equitable interest, and becomes a licensed activity on 2027-02-26; unlicensed public marketing of contracts is not available after that date.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Same as public marketing: the definition does not carve out private outreach to known investors; licensed activity from 2027-02-26.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: 'Wholesale agreements require the section 2940 disclosure and are subject to a non-waivable 21-day seller cancellation right with refunds within 10 business days. Assignments from sheriff and bankruptcy auctions are excluded from the wholesaling definition.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The definition covers assignment of an equitable interest without taking title, so buying and reselling appears outside it; but the owner exemption is unavailable to anyone engaged in wholesaling as a business. Counsel must confirm how a double-close business is treated.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: 'The seller may cancel until midnight of the 21st calendar day after signing the disclosure, or until closing, whichever comes first; notice by certified mail, electronic or personal delivery; refunds and a voidness acknowledgment within 10 business days; non-waivable.',
        sourceIds: ['s1'],
        deadline: {
          days: 21,
          businessDays: false,
          trigger:
            'after the seller executes the wholesale disclosure (ends earlier at closing)',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: '6 Del. C. 18-902: a foreign LLC must register with the Secretary of State before doing business, naming a registered agent and filing a home-state certificate of existence. Section 18-912 exempts only limited activities (e.g., an isolated transaction not part of a series of similar ones).',
        sourceIds: ['s4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: '85 Del. Laws c. 274 (SB 201, 153rd General Assembly)',
        title:
          'An Act to amend Title 24 of the Delaware Code relating to real estate brokers and salespersons',
        url: 'https://legis.delaware.gov/legacy/SessionLaws/ga153/chp274.shtml',
        type: 'statute',
        effectiveDate: '2026-06-01',
        summary:
          'Defines wholesaling, limits the owner exemption, adds section 2940 disclosure and 21-day cancellation (90 days after enactment), and makes wholesaling a licensed real estate service (270 days after enactment).',
      },
      {
        id: 's2',
        citation: '24 Del. C. sections 2901-2902 (Chapter 29, Subchapter I)',
        title: 'Real Estate Brokers and Salespersons - General Provisions',
        url: 'https://delcode.delaware.gov/title24/c029/sc01/index.html',
        type: 'statute',
        effectiveDate: '2027-02-26',
        summary:
          'Codified text showing the wholesaling definition and the version of section 2902(a)(21), effective February 26, 2027, that adds wholesaling to real estate services.',
      },
      {
        id: 's3',
        citation: 'Delaware Real Estate Commission',
        title: 'Real Estate Commission page (SB 201 notice)',
        url: 'https://dpr.delaware.gov/boards/realestate/',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "Commission page announcing SB 201's wholesaling requirements and a new Disclosure for Wholesale Transactions form.",
      },
      {
        id: 's4',
        citation: '6 Del. C. sections 18-902 and 18-912',
        title: 'Foreign limited liability companies',
        url: 'https://delcode.delaware.gov/title6/c018/sc09/index.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires foreign LLC registration with the Secretary of State before doing business, and lists activities that do not count as doing business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Between 2026-08-30 and 2027-02-26, do section 2940 duties (phrased for licensees) bind unlicensed wholesalers, and is unlicensed wholesaling lawful in that window given the narrowed owner exemption?',
      'Obtain the official Disclosure for Wholesale Transactions form (the published link returned 404) and confirm signature and language-version rules.',
      'Can a brokerage entity rely on section 2901(c) (organization unlicensed if a licensed broker is responsible), and which staff need individual licenses?',
      "What does 'engaged in wholesaling as a business' mean for an occasional double close?",
      'Does the 21-day right extend to end buyers or only sellers?',
    ],
    activationSteps: [
      'Before 2027-02-26, obtain a Delaware broker license (or a licensed broker of record for the entity) for Delaware wholesaling.',
      "Use the Commission's Disclosure for Wholesale Transactions in the seller's language at or before signing, and track the 21-calendar-day cancellation window and 10-business-day refunds.",
      'Register the LLC with the Delaware Secretary of State and appoint a registered agent.',
      "Get counsel's view on activity during the transition window, or pause unlicensed Delaware activity now.",
    ],
    confidence: 'medium',
  },
  {
    code: 'DC',
    name: 'District of Columbia',
    researchedAt: '2026-10-22',
    summary:
      "No District of Columbia wholesaling statute was found, but research was limited: web search was unavailable for this jurisdiction and only selected D.C. Code sections were fetched. The broker definition in D.C. Code 47-2853.161 lists selling, purchasing and similar acts for a fee without an express 'for another' qualifier, and no owner exemption was located. TOPA (42-3404.02) gives tenants a right to purchase before an owner sells rental housing, and 42-1704 escrow rules apply to anyone holding funds in a real estate transaction, licensed or not.",
    proposedClassification: 'E',
    classificationRationale:
      "The verified sources cannot settle whether an unlicensed principal may assign contracts for a fee: the broker definition lacks the 'for another' wording other jurisdictions rely on, the exemptions section was not located, and no Commission guidance or Council legislation search was possible. The honest classification is E until counsel reviews the full licensing chapter and recent Council acts.",
    regulator: {
      name: 'District of Columbia Real Estate Commission (Department of Licensing and Consumer Protection)',
      url: 'https://dlcp.dc.gov/page/real-estate-commission',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "47-2853.161 describes a broker as one who, for a fee, lists, sells, exchanges, purchases, rents or leases real property, with no 'for another' qualifier in the text reviewed; no owner or principal exemption was found. Cannot conclude.",
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'None found in the sections reviewed, but Council legislation could not be searched.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'Depends on whether the 47-2853.161 definition reaches principals; unresolved.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure found; not comprehensively researched.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not determinable from sources reviewed.',
        sourceIds: [],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not determinable from sources reviewed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'For tenant-occupied housing accommodations, TOPA requires the owner to give tenants an opportunity to purchase on bona fide terms before selling, which affects whether and when a purchase contract can close or be assigned. Separately, 42-1704 escrow rules (insured account within 7 days, no commingling) apply to any person holding deposits in a real estate transaction, whether or not licensed.',
        sourceIds: ['s2', 's3'],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: 'Not determinable; the broker definition includes purchasing for a fee.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific right found; not comprehensively researched.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'D.C. is a single local jurisdiction; D.C. Code and DCMR rules apply directly. No additional ward- or neighborhood-level rules identified.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'D.C. Code 29-105.02: a foreign filing entity may not do business in the District until it registers with the Mayor (DLCP). Registered agent and business license requirements were not verified.',
        sourceIds: ['s4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'D.C. Code 47-2853.161',
        title: 'Eligibility; scope of practice - real estate broker',
        url: 'https://code.dccouncil.gov/us/dc/council/code/sections/47-2853.161',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Describes real estate broker activities for a fee (listing, selling, purchasing, renting, leasing, collecting rent, negotiating loans, selling subdivided lots) without an express 'for another' qualifier.",
      },
      {
        id: 's2',
        citation: 'D.C. Code 42-3404.02',
        title: 'Tenant opportunity to purchase before sale',
        url: 'https://code.dccouncil.gov/us/dc/council/code/sections/42-3404.02',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Gives tenants the right to purchase their housing accommodation before the owner may sell it; amended as recently as 2025.',
      },
      {
        id: 's3',
        citation: 'D.C. Code 42-1704',
        title: 'Escrow accounts',
        url: 'https://code.dccouncil.gov/us/dc/council/code/sections/42-1704',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires any person receiving funds in a real estate transaction, licensed or not, to deposit them in an insured, segregated escrow account.',
      },
      {
        id: 's4',
        citation: 'D.C. Code 29-105.02',
        title: 'Registration to do business in the District',
        url: 'https://code.dccouncil.gov/us/dc/council/code/sections/29-105.02',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Bars a foreign filing entity from doing business in the District until it registers with the Mayor.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does D.C. law exempt owners or principals from real estate licensing (statute or 17 DCMR), and does 47-2853.161 reach a principal who buys and assigns contracts for a fee?',
      'Has the D.C. Council enacted or introduced wholesaling, investor-solicitation or deed-theft legislation in 2023-2026?',
      'How does TOPA, including any single-family exemptions, apply to wholesale contracts on tenant-occupied homes, and can TOPA rights or contracts be assigned?',
      'Does 42-1704 require the company to hold earnest money in a D.C. escrow account when it is the buyer?',
      'What D.C. business license (Basic Business License) and tax registrations does a foreign wholesaling LLC need?',
    ],
    activationSteps: [
      'Do not launch D.C. until counsel resolves the licensing question; in the meantime any D.C. activity should go through a D.C.-licensed broker.',
      'Register the LLC with DLCP before doing business in the District.',
      'Screen for tenant-occupied properties and build TOPA compliance into contract timelines.',
      'Hold any deposits under 42-1704-compliant escrow arrangements.',
    ],
    confidence: 'low',
  },
  {
    code: 'FL',
    name: 'Florida',
    researchedAt: '2026-10-22',
    summary:
      'Florida has no wholesaling-specific statute, disclosure rule, or registration; the question turns on the brokerage licensing law, Fla. Stat. ch. 475, which covers persons who, for another and for compensation, sell, buy, negotiate, or advertise real property interests, and makes a single act sufficient. Unlicensed brokerage is a third-degree felony and compensation agreements for unlicensed brokerage are unenforceable. The common position that a principal may assign its own contract but must not market the property rests on secondary sources; no Florida Real Estate Commission guidance or 2024-2026 wholesaling bill was found.',
    proposedClassification: 'A',
    classificationRationale:
      "No Florida statute or rule imposes wholesaling-specific registration, disclosure, notice, or cancellation conditions, and the license law reaches only acts done 'for another', which on its face excludes a principal assigning its own contract. That fits A. Confidence is low because no regulator guidance or case confirming the principal-assignment reading was found, the single-act rule and felony penalty raise the stakes, and secondary sources treat advertising the property itself as brokerage, which would push toward D for any public property marketing.",
    regulator: {
      name: 'Florida Real Estate Commission (Department of Business and Professional Regulation, Division of Real Estate)',
      url: 'https://www.myfloridalicense.com',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'The ch. 475 broker definition is limited to acts done for another for compensation (475.01(1)(a)); a principal assigning its own contract interest is commonly treated as outside it (secondary). No statute, rule, FREC/DBPR statement or case confirming this for repeated assignments was found. The 475.011 owner exemption covers persons dealing in property they own, which a contract holder may not be.',
        sourceIds: ['s1', 's2', 's5', 's6'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler-specific statute or registration was found; secondary sources state Florida has no wholesaling statute and regulates the activity only through ch. 475.',
        sourceIds: ['s6'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "A license is required where the person acts for another for compensation, including advertising or procuring buyers for another's property. 475.01(3) makes a single act sufficient, so there is no frequency threshold or repeat-activity safe harbor. Unlicensed practice is a third-degree felony (475.42) and compensation for unlicensed brokerage is unenforceable (475.41).",
        sourceIds: ['s1', 's3', 's4'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No wholesaling-specific disclosure or notice requirement was found in Florida statutes or in the sources reviewed.',
        sourceIds: ['s6'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Secondary sources say an unlicensed principal may advertise its assignable contract interest, but publicly advertising the property itself (MLS, Zillow-type listings) is treated as brokerage. Not confirmed by FREC or DBPR guidance; counsel must decide what advertising content is safe.',
        sourceIds: ['s1', 's5'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Offering one's own contract interest to known investors is not on its face an act 'for another' under 475.01(1)(a), so it is likely outside the license requirement; supported only by statutory text and secondary sources.",
        sourceIds: ['s1', 's5'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No Florida statute restricting, conditioning, or requiring consent for assignment of residential purchase contracts was found in this research.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "475.011 exempts persons selling property they own, but the exemption is lost if an agent, employee, or contractor paid on a transactional basis conducts the sales. Reselling after taking title therefore appears exempt if Hālo's dispositions staff are not paid per transaction; marketing to the end buyer before the first closing raises the same questions as contract marketing.",
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesaling-specific or general statutory seller cancellation right was identified; not researched beyond ch. 475.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found; local rules were not specifically researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'Fla. Stat. 605.0902 requires a foreign LLC to apply for a certificate of authority to transact business (Form CR2E027) with a certificate of existence no more than 90 days old and a Florida registered agent with a Florida street address.',
        sourceIds: ['s7', 's8'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Fla. Stat. 475.01 (2025)',
        title: '475.01 Definitions',
        url: 'https://www.flsenate.gov/Laws/Statutes/2025/475.01',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as one who, for another and for compensation, sells, buys, negotiates, advertises, or procures parties for real property interests; a single such act is sufficient.',
      },
      {
        id: 's2',
        citation: 'Fla. Stat. 475.011 (2025)',
        title: '475.011 Exemptions',
        url: 'https://www.flsenate.gov/Laws/Statutes/2025/475.011',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts owners selling or leasing their own property, except where a transaction-paid agent, employee, or contractor is used to conduct the sales.',
      },
      {
        id: 's3',
        citation: 'Fla. Stat. 475.41',
        title: '475.41 Contracts of unlicensed person for commissions invalid',
        url: 'https://m.flsenate.gov/Statutes/475.41',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Agreements for compensation for brokerage acts are invalid unless the person was properly licensed when the act was performed.',
      },
      {
        id: 's4',
        citation: 'Fla. Stat. 475.42 (2021 compilation)',
        title: '475.42 Violations and penalties',
        url: 'https://www.flsenate.gov/Laws/Statutes/2021/475.42',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Operating as a broker without an active license is prohibited and is a third-degree felony.',
      },
      {
        id: 's5',
        citation: 'LegalClarity, Is Wholesaling Real Estate Legal in Florida?',
        title: 'Is Wholesaling Real Estate Legal in Florida?',
        url: 'https://legalclarity.org/is-wholesaling-real-estate-legal-in-florida/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Says wholesaling is legal when the wholesaler markets its equitable interest in the contract, and that publicly advertising the property itself (MLS, Zillow) requires a license.',
      },
      {
        id: 's6',
        citation: 'Ark7, Florida Real Estate Wholesaling Guide',
        title: 'Florida real estate wholesaling guide',
        url: 'https://ark7.com/blog/learn/cities/florida-real-estate-wholesaling-guide/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Says Florida has no wholesaling-specific statute, so wholesalers should act as principals and assign only their contract interest under ch. 475.',
      },
      {
        id: 's7',
        citation: 'Fla. Stat. 605.0902',
        title: '605.0902 Application for certificate of authority',
        url: 'https://m.flsenate.gov/Statutes/605.0902',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Sets the contents of a foreign LLC's application for authority to transact business in Florida.",
      },
      {
        id: 's8',
        citation: 'Florida Department of State, Form CR2E027',
        title:
          'Application by Foreign Limited Liability Company for Authorization to Transact Business in Florida',
        url: 'https://dos.fl.gov/media/702400/cr2e027.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLC application form requiring a certificate of existence no more than 90 days old and a Florida registered agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Is a principal that repeatedly assigns its own purchase contracts for a fee outside the 475.01(1)(a) 'for another' definition? Is there Florida case law or a FREC final order on wholesaling?",
      'What may an unlicensed principal include when marketing a contract interest (address, photos, condition) without being treated as advertising the property for another?',
      'Does paying Hālo dispositions staff per deal forfeit the 475.011 owner exemption for double closings?',
      'Documentary stamp tax treatment of assignment fees and of the two deeds in a double closing.',
      'Confirm there is no 2026 or 2027 Florida bill regulating wholesaling (this research found none, but the Florida Senate bill search could not be queried directly).',
    ],
    activationSteps: [
      "Obtain a Florida counsel opinion on whether Hālo's assignment model is outside the ch. 475 broker definition, given the single-act rule and felony exposure.",
      'Until counsel clears property-level advertising, market Florida deals only as assignable contract interests to buyers, not as properties for sale, and never list them on an MLS or consumer listing sites.',
      "Structure the assignment fee as consideration for Hālo's own contract interest, not as a commission for services to the seller or end buyer.",
      'If property-level public marketing is wanted, route it through a Florida-licensed broker.',
      'File Form CR2E027 with the Florida Department of State and appoint a Florida registered agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'GA',
    name: 'Georgia',
    researchedAt: '2026-10-22',
    summary:
      "Georgia has no wholesaling-specific statute or registration; licensing turns on acting for another for a fee under O.C.G.A. 43-40-1, and secondary sources say a principal may assign its own contract or double close but may not market the property itself. Since 2024-01-01, unsolicited written offers or mailings from unlicensed persons expressing interest in buying real property must carry prescribed solicitation notices on the letter and envelope (O.C.G.A. 10-1-393.19), enforceable as an unfair practice with class-action exposure. Secondary sources and the Attorney General's consumer page report later-added monetary-offer notices and higher penalties whose enacting text was not verified.",
    proposedClassification: 'B',
    classificationRationale:
      "Principal assignments appear permitted without a license (on secondary sources and the 'for another' definition), but seller acquisition marketing by unlicensed buyers is conditioned on statutory solicitation notices. That condition is a disclosure requirement, which fits B. Confidence is low because the license-law reading rests on secondary sources and the current text of the solicitation statute after its reported amendment was not confirmed.",
    regulator: {
      name: 'Georgia Real Estate Commission & Appraisers Board',
      url: 'https://grec.state.ga.us',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "O.C.G.A. 43-40-1 defines a broker as one acting for another for a fee, including negotiating or dealing in options. Secondary sources say assigning one's own contract interest is permitted without a license if the wholesaler does not represent the seller or buyer or market the property. No GREC guidance on wholesaling was found (its FAQ does not address it).",
        sourceIds: ['s1', 's7'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration or wholesaling statute was found; secondary sources describe Georgia wholesaling as governed by the general license law.',
        sourceIds: ['s7'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Required only where the person acts for another for compensation (43-40-1). No frequency threshold was found. Representing a seller or buyer, or marketing the property rather than the contract, is described by secondary sources as requiring a license.',
        sourceIds: ['s1', 's7'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'O.C.G.A. 10-1-393.19 (SB 90, eff. 2024-01-01) applies to unsolicited written inquiries or mailings by persons not licensed under Title 43 ch. 40 or 41 (or Title 15 ch. 19) that express interest in buying real property or offer real estate services. Failure is an unfair or deceptive practice; the enacted text allows class actions and the greater of actual damages or $200 per violation. Secondary sources and the AG consumer page report added monetary-offer notices, treble or $600 damages, and misdemeanor liability; verify the current text.',
        sourceIds: ['s2', 's3', 's4', 's5', 's6'],
        items: [
          {
            audience: 'seller',
            description:
              "At the top of each unsolicited written inquiry or mailing, set at least two inches from other text, a capitalized notice that the letter is a solicitation about selling the recipient's home and that no response is required; no other text may be larger. Notices must match the main font, be at least 16 point, and use a distinctly contrasting color.",
            timing:
              'On every unsolicited written inquiry or mailing to a property owner.',
          },
          {
            audience: 'seller',
            description:
              'On the envelope front (or the postage area if no envelope), a capitalized notice that it is a solicitation the recipient need not open or answer.',
            timing: 'On every unsolicited mailing.',
          },
          {
            audience: 'seller',
            description:
              "Reported but not verified in enacted text: if a money offer is included, a notice that it may not be fair market value, and if below the prior year's county assessed value, a notice saying so.",
            timing: 'On unsolicited written offers that state a price.',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Secondary sources say an unlicensed wholesaler may market the assignment contract but not market or list the property itself. No statute or GREC guidance on wholesale advertising was found.',
        sourceIds: ['s7'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Marketing one's own contract interest to known investors is, on secondary sources and the 'for another' definition, outside brokerage; not confirmed by GREC.",
        sourceIds: ['s1', 's7'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No Georgia statute restricting or conditioning assignment of residential purchase contracts was found in this research.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Secondary sources say an unlicensed person may personally buy and resell in a double closing; selling property one owns is not an act for another under 43-40-1. Not confirmed by an official source.',
        sourceIds: ['s1', 's7'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesaling-specific seller cancellation right was found; general Georgia law was not researched.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found; local rules were not specifically researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC transacting business in Georgia must obtain a certificate of authority from the Secretary of State (application under O.C.G.A. 14-11-702) and maintain a Georgia registered agent; failing to obtain it within 30 days of starting business carries a $500 civil penalty.',
        sourceIds: ['s8'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'O.C.G.A. 43-40-1 (FindLaw compilation)',
        title: 'Georgia Code 43-40-1 Definitions',
        url: 'https://codes.findlaw.com/ga/title-43-professions-and-businesses/ga-code-sect-43-40-1/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as a person who, for another and for compensation, lists, sells, buys, negotiates, deals in options on, or advertises real estate services.',
      },
      {
        id: 's2',
        citation: 'O.C.G.A. 10-1-393.19 (Ga. L. 2023, p. 255, SB 90 Sec. 2)',
        title:
          'O.C.G.A. Title 10, Ch. 1, Art. 15, Pt. 2 (Fair Business Practices Act), compiled February 2024',
        url: 'https://consumer.georgia.gov/document/document/fbpa-february-2024pdf/download',
        type: 'statute',
        effectiveDate: '2024-01-01',
        summary:
          'Requires solicitation notices on unsolicited written inquiries by unlicensed persons seeking to buy real property and makes noncompliance an unfair practice with class actions and $200 minimum damages.',
      },
      {
        id: 's3',
        citation: 'SB 90 (2023-2024), House committee substitute LC 50 0572S',
        title: 'S.B. 90 (SUB)',
        url: 'https://www.legis.ga.gov/api/legislation/document/20232024/217809',
        type: 'bill',
        effectiveDate: '2024-01-01',
        summary:
          'Bill text adding 10-1-393.19 on unsolicited real property inquiries, with an effective date of January 1, 2024.',
      },
      {
        id: 's4',
        citation: 'Georgia Department of Law, Consumer Protection Division',
        title:
          'Title Theft and Unsolicited Real Estate, Brokerage, and Mortgage Solicitations',
        url: 'https://consumer.georgia.gov/title-theft-and-unsolicited-real-estate-solicitations',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Consumer page describing required notices on unsolicited purchase offers, including fair-market-value and below-assessed-value notices when a price is offered.',
      },
      {
        id: 's5',
        citation: 'DealMachine help center (2025-03-03)',
        title: 'Georgia State Law About Mail',
        url: 'https://help.dealmachine.com/en/articles/10317167-georgia-state-law-about-mail',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports monetary-offer notices, treble or $600 per-violation damages, and misdemeanor penalties under 10-1-393.19.',
      },
      {
        id: 's6',
        citation: 'Pebble knowledge base',
        title: 'Mailing Law - Georgia Code 10-1-393.19',
        url: 'https://kb.pebblerei.com/article/434-mailing-law-georgia-code-10-1-393-19',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Summarizes the Georgia mail-solicitation notices, including the reported monetary-offer notices and enhanced penalties.',
      },
      {
        id: 's7',
        citation: 'PropStream investor blog (2025-12-08)',
        title: 'Wholesaling Real Estate in Georgia: All You Need to Know',
        url: 'https://www.propstream.com/real-estate-investor-blog/wholesaling-real-estate-in-georgia-all-you-need-to-know',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Says Georgia wholesaling is permitted by assigning contract rights or double closing, but not by marketing or listing the property itself.',
      },
      {
        id: 's8',
        citation: 'Ga. Comp. R. & Regs. 590-7-21',
        title: 'Limited Liability Companies - Filing of Documents',
        url: 'https://rules.sos.ga.gov/GAC/590-7-21',
        type: 'regulation',
        effectiveDate: null,
        summary:
          'A foreign LLC must obtain a certificate of authority before transacting business, with a $500 penalty if not obtained within 30 days of starting business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'What is the current text of O.C.G.A. 10-1-393.19 after the reported 2024 amendment (monetary-offer notices, treble or $600 damages, misdemeanor), and which act made it?',
      'Does 10-1-393.19 reach text messages, emails, or online ads, or only written inquiries and mailings?',
      "Does repeated assignment of contracts for a fee amount to dealing in options or negotiating 'for another' under 43-40-1? Is there GREC enforcement history against wholesalers?",
      'What property details may an unlicensed principal include when marketing a contract interest?',
      'Georgia income tax and withholding registration for a foreign LLC.',
    ],
    activationSteps: [
      'Add the 10-1-393.19 notices (top-of-letter and envelope, at least 16 point, contrasting color, nothing larger) to every Georgia seller mailing, and get counsel to confirm the current monetary-offer notice wording before any mailer states a price.',
      'Market Georgia deals only as assignable contract interests; do not list or advertise the property as for sale.',
      'Obtain Georgia counsel confirmation that repeated principal assignments and double closings fall outside 43-40-1.',
      'Obtain a certificate of authority from the Georgia Secretary of State within 30 days of starting business and appoint a Georgia registered agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'HI',
    name: 'Hawaii',
    researchedAt: '2026-10-22',
    summary:
      "No Hawaii wholesaling statute or Real Estate Commission guidance was found. HRS 467-1 limits broker activity to acts for others as a whole or partial vocation, but expressly includes anyone who secures and sells an option on real estate without exercising it as a means of evading licensing. HRS 467-2's owner exception excludes individuals engaged in the business of real estate development or brokerage and those who acquire interests to evade licensing.",
    proposedClassification: 'E',
    classificationRationale:
      "The 'for others' wording favors principals, but the option-flipping clause and the anti-evasion limits on the owner exception target transactions resembling wholesaling, and no guidance explains whether an assignable purchase contract is treated like an option. Insufficient information to classify.",
    regulator: {
      name: 'Hawaii Real Estate Commission',
      url: null,
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: 'HRS 467-1 covers acts for others as a whole or partial vocation, which supports principal assignments, but also covers securing and selling an option on real estate without exercising it to evade licensing. Whether a wholesale purchase contract is treated as an option is unresolved.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "A license is required for acts for others as a vocation and for selling unexercised options as a means of evading licensing; no frequency threshold beyond 'whole or partial vocation' found.",
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Soliciting prospective purchasers is listed broker activity when done for others; principal marketing of a contract interest is not addressed.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Buying and reselling for its own account is not an act for others under HRS 467-1; note that the owner exception in HRS 467-2 excludes individuals engaged in the business of real estate development or brokerage, so repeat resellers should confirm with counsel.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: "Secondary source: a foreign LLC must obtain a certificate of authority from DCCA's Business Registration Division (HRS 428-1002, Form FLLC-1) and a general excise tax license.",
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'HRS 467-1',
        title: 'HRS 467-1 - Definitions (real estate broker)',
        url: 'https://data.capitol.hawaii.gov/hrscurrent/Vol10_Ch0436-0474/HRS0467/HRS_0467-0001.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker by listed acts for others as a vocation, plus securing and selling unexercised options as a means of evading licensing; real estate includes all interests in real property.',
      },
      {
        id: 's2',
        citation: 'HRS 467-2',
        title: 'HRS 467-2 - Exceptions',
        url: 'https://data.capitol.hawaii.gov/hrscurrent/Vol10_Ch0436-0474/HRS0467/HRS_0467-0002.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts individual owners for their own real estate, excluding those in the business of development or brokerage or acquiring interests to evade licensing.',
      },
      {
        id: 's3',
        citation: 'Harbor Compliance, Hawaii foreign LLC registration',
        title: 'Hawaii Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-hawaii-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports that foreign LLCs obtain a certificate of authority from DCCA under HRS 428-1002 and need a general excise tax license.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does the Hawaii Real Estate Commission treat an assignable purchase contract that is never closed as an option sold to evade licensing under HRS 467-1?',
      "Does the HRS 467-2 owner exception's exclusion of persons in the business of real estate development reach repeat buy-and-resell investors?",
      "Do Hawaii's mortgage rescue or distressed-property statutes give sellers cancellation rights in purchases of homes in foreclosure?",
      'Were any wholesaling bills introduced in the 2025 or 2026 Hawaii sessions? None were found in this pass.',
    ],
    activationSteps: [
      'Do not launch Hawaii until counsel resolves the option-evasion question.',
      'Obtain a certificate of authority from DCCA and a general excise tax license.',
      'Consider a Hawaii-licensed broker partner for marketing.',
    ],
    confidence: 'low',
  },
  {
    code: 'ID',
    name: 'Idaho',
    researchedAt: '2026-10-22',
    summary:
      "Idaho has no wholesaler statute, but its license law exempts transactions only for a person's own account, bars using exemptions to evade licensing, and treats a single act as engaging in business. Idaho Real Estate Commission Guideline #18 (Dealer in Options) states that option holders are not owners and that an investor who lists, sells or negotiates the sale of property he does not own, or procures buyers for it, may be practicing without a license. The guideline also says a purchase made while already committed to resell to another is not for one's own account.",
    proposedClassification: 'C',
    classificationRationale:
      "The regulator's published guideline treats marketing property one does not own and procuring buyers for it as brokerage, and hiring a licensee to list it does not cure the problem; that describes wholesaling as typically practised, so a license (or a restructured model) is needed. The guideline addresses options most directly rather than assignable purchase contracts, so confidence is medium.",
    regulator: {
      name: 'Idaho Real Estate Commission (Division of Occupational and Professional Licenses)',
      url: 'https://dopl.idaho.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Idaho Code 54-2003(1)(a) exempts purchase, option or sale of any interest in real property for one's own account, but 54-2003(4) bars use of exemptions to evade licensing. Guideline #18 says procuring buyers for, or negotiating the sale of, property one does not own may be unlicensed practice. A bare assignment without marketing the property may fit the exemption; counsel to confirm.",
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'The Idaho Real Estate License Law and Rules booklet (July 2025) contains no wholesaler registration provision.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Per Guideline #18, listing, selling or negotiating the sale of property one does not own, or procuring buyers for it, may require a license; Idaho Code 54-2004(39) includes procuring prospects and dealing in options; a single act suffices (54-2002). No frequency threshold. This rests on Commission guidance rather than a wholesaling statute.',
        sourceIds: ['s1', 's2', 's4'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'Guideline #18 indicates that an unlicensed investor marketing or procuring buyers for property he does not own may be engaged in unlicensed practice, and using a licensee to list it does not cure that. Guidance, not statute.',
        sourceIds: ['s2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: "The guideline's 'procures buyers' language likely reaches direct outreach to known investors, but it does not separately address marketing a contract interest; counsel to confirm.",
        sourceIds: ['s2'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assigning residential purchase contracts was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Guideline #18: buying first and later reselling is for one's own account and exempt, but if an agreement to resell to another existed when the purchase closed, the purchase was for another and not exempt; pre-arranged same-day double closings are therefore at risk.",
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign filing entity may not do business in Idaho until it registers with the Secretary of State (Idaho Code 30-21-502); unregistered entities cannot maintain actions in Idaho courts.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Idaho Code 54-2004(39) (as reproduced in Idaho Real Estate License Law & Rules, July 2025)',
        title: 'Idaho Real Estate License Law & Rules booklet',
        url: 'https://dopl.idaho.gov/wp-content/uploads/2026/03/Idaho-Real-Estate-License-Law-Rules-Booklet-FINAL-VERSION.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines real estate broker to include acting for another for compensation, procuring prospects, and acting as a dealer in options; contains no wholesaling provision.',
      },
      {
        id: 's2',
        citation:
          'Idaho Real Estate Commission Guideline #18, Dealer in Options (reviewed March 2019)',
        title: 'Guideline #18 - Dealer in Options',
        url: 'https://dopl.idaho.gov/wp-content/uploads/2026/03/Idaho-Real-Estate-License-Law-Rules-Booklet-FINAL-VERSION.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "Says option holders are not owners, investors procuring buyers for property they do not own may be unlicensed, and resale pre-arranged at purchase is not for one's own account.",
      },
      {
        id: 's3',
        citation: 'Idaho Code 54-2003',
        title: 'Idaho Code 54-2003 - Exceptions',
        url: 'https://legislature.idaho.gov/statutesrules/idstat/Title54/T54CH20/SECT54-2003/',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Exempts purchase, option or sale of real property interests for one's own account, and treats use of exemptions to evade the chapter as unlicensed practice.",
      },
      {
        id: 's4',
        citation: 'Idaho Code 54-2002',
        title: 'Idaho Code 54-2002 - Licensure required',
        url: 'https://legislature.idaho.gov/statutesrules/idstat/Title54/T54CH20/SECT54-2002/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Prohibits acting as a broker without an Idaho license and treats any single act within the broker definition as engaging in the business.',
      },
      {
        id: 's5',
        citation: 'Idaho Code 30-21-502',
        title: 'Idaho Code 30-21-502 - Foreign registration',
        url: 'https://legislature.idaho.gov/statutesrules/idstat/Title30/T30CH21/SECT30-21-502/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires foreign filing entities to register with the Secretary of State before doing business in Idaho.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does the Commission apply Guideline #18's reasoning to assignable purchase and sale agreements (where the buyer has equitable title), not just options?",
      'Would an assignment to an end buyer who was not solicited by the company still count as procuring a buyer?',
      'Were any wholesaling bills introduced in the 2025 or 2026 Idaho sessions? None were found in this pass.',
    ],
    activationSteps: [
      'Register the foreign LLC with the Idaho Secretary of State.',
      'Obtain an Idaho broker license or partner with an Idaho designated broker before marketing properties held under contract.',
      'If operating as principal only, close on the purchase without a pre-arranged resale agreement and market only after taking title.',
      "Obtain Idaho counsel's sign-off on any assignment model.",
    ],
    confidence: 'medium',
  },
  {
    code: 'IL',
    name: 'Illinois',
    researchedAt: '2026-10-22',
    summary:
      'Illinois folds wholesaling into the Real Estate License Act: the definition of broker covers anyone who, for others or for themselves, engages in a pattern of buying, selling, marketing or otherwise dealing in contracts, including assignable purchase contracts. A pattern exists at 2 or more occasions in any 12-month period, counted together with affiliated individuals and entities. No wholesaler-specific registration or disclosure statute was found.',
    proposedClassification: 'C',
    classificationRationale:
      '225 ILCS 454/1-10 expressly makes dealing in or marketing assignable real estate contracts a licensed broker activity once it happens twice in any 12 months, and the count aggregates partners and common owners in other entities, so structuring through multiple LLCs does not help. The owner exemption in 5-20 covers only property the person owns or leases. Repeated assignments, which is the intended business, therefore require an Illinois broker license or a different structure.',
    regulator: {
      name: 'Illinois Department of Financial and Professional Regulation (Division of Real Estate)',
      url: 'https://idfpr.illinois.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Only on a single occasion in any rolling 12-month period. The broker definition covers dealing in assignable contracts whether for others or for oneself; 2 or more occasions in 12 months is a pattern, and occasions by affiliated persons or commonly owned entities are combined.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler-specific registration found; Illinois regulates the activity through broker licensing under the Real Estate License Act instead.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Engaging in a pattern (2+ occasions in any 12 months) of buying, selling, offering, marketing or dealing in contracts, including assignable purchase contracts, is a licensed broker activity. Aggregation across related entities applies.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'no',
        note: "No wholesaling-specific disclosure statute was found in searches; the state's approach is licensing. Licensees would carry the ordinary RELA disclosure and advertising duties, which were not researched here.",
        sourceIds: ['s1'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Marketing a contract for sale is itself one of the listed contract-dealing activities and counts toward the 2-in-12-months pattern, so an unlicensed principal could at most market a single deal per 12 months.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'The pattern rule does not distinguish public from private marketing; offering or selling the contract to known investors is still dealing in contracts and counts toward the 2-in-12 threshold.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No consent or notice requirement for assignment was found, but assigning purchase contracts counts toward the licensing pattern threshold.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The owner exemption covers acts relating to property the person owns, so reselling after taking title is arguably exempt. However, the contract-dealing clause also covers buying and selling contracts for the purchase or sale of real estate, so repeated buy-and-resell contracting may itself count toward the pattern. Counsel must decide.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesaling-specific seller cancellation right was found in the sections reviewed.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rule (e.g., Chicago, Cook County) was found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC files Form LLC-45.5 (Application for Admission to Transact Business) with the Secretary of State, attaching a recent certificate of good standing, and must maintain an Illinois registered agent and office. Note also that an entity broker license becomes inactive if the entity is not in good standing or not authorized to do business in Illinois.',
        sourceIds: ['s3', 's4', 's1'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: '225 ILCS 454/1-10',
        title: 'Real Estate License Act of 2000, Definitions (Broker, item 5)',
        url: 'https://www.ilga.gov/Documents/legislation/ilcs/documents/022504540K1-10.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker to include anyone who, for others or themselves, engages in a pattern of dealing in or marketing real estate contracts including assignable contracts, with a pattern found at 2+ occasions in any 12 months counting affiliated persons; current text cites P.A. 103-1039, eff. 2025-01-01.',
      },
      {
        id: 's2',
        citation: '225 ILCS 454/5-20',
        title: 'Exemptions from broker license requirement',
        url: 'https://www.ilga.gov/Documents/legislation/ilcs/documents/022504540K5-20.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts an owner or lessor only for acts relating to the owned or leased property and not for property the person does not own or lease.',
      },
      {
        id: 's3',
        citation: 'Ill. SOS Form LLC-45.5',
        title: 'Application for Admission to Transact Business (foreign LLC)',
        url: 'https://www.ilsos.gov/content/dam/publications/pdf_publications/llc455.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Secretary of State form for a foreign LLC to obtain authority, requiring registered agent details and a certificate of good standing.',
      },
      {
        id: 's4',
        citation: '805 ILCS 180',
        title: 'Illinois Limited Liability Company Act',
        url: 'https://www.ilga.gov/legislation/ILCS/details?ActID=2290&ChapterID=65&SeqStart=12700000&SeqEnd=14450000',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Statute governing domestic and foreign LLCs, including admission of foreign LLCs to transact business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does entering into back-to-back purchase and resale contracts for a double close count as 'dealing in contracts' toward the 2-in-12-months pattern?",
      "How does IDFPR count 'occasions' (per contract, per assignment, per property) and how does it apply the aggregation across commonly owned entities to a platform with many users?",
      "If Halo only facilitates and the users are the principals, is the platform itself 'assisting in procuring prospects' (item 8) or 'assisting in negotiation' (item 9) for compensation?",
      'Which RELA advertising and disclosure rules apply if Halo obtains an Illinois entity broker license?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Either obtain an Illinois entity broker license (with a designated managing broker) or route all Illinois contract marketing and assignments through an Illinois-licensed sponsoring broker.',
      'If operating unlicensed, hard-limit Illinois assignments and contract marketing to one occasion per rolling 12 months across Halo and every affiliated entity or common owner.',
      'File Form LLC-45.5 and appoint an Illinois registered agent before transacting.',
    ],
    confidence: 'high',
  },
  {
    code: 'IN',
    name: 'Indiana',
    researchedAt: '2026-10-22',
    summary:
      "Indiana has no wholesaler license or registration, but since July 2024 an unlicensed person soliciting the sale or purchase of a single-family home must include a statutory not-a-licensee disclosure, with legal names, in every solicitation; a homeowner may rescind within two days if the disclosure was deficient. The general license law requires a license to buy, sell or option real estate for consideration, with an exemption for acts relating to real estate a person owns; whether a contract purchaser's equitable interest counts as owned real estate was not resolved.",
    proposedClassification: 'B',
    classificationRationale:
      'IC 32-21-16.5 expressly regulates unlicensed solicitors, including those who do not intend to take title, through disclosure and a short rescission right, which suggests the legislature contemplated unlicensed wholesaling subject to conditions. The license-law question under IC 25-34.1-3-2 remains unresolved, so this is proposed B with low confidence.',
    regulator: {
      name: 'Indiana Real Estate Commission (Indiana Professional Licensing Agency)',
      url: 'https://www.in.gov/pla/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "No statute found that bars it, and IC 32-21-16.5 contemplates unlicensed solicitors who do not intend to take title. But IC 25-34.1-3-2 requires a license to sell, buy, option or negotiate real estate for consideration, 'real estate' includes any interest in real property, and the exemption covers only real estate the person owns. Whether a contract interest is owned real estate is an open question.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration found; the 2024 law imposes disclosures on unlicensed solicitors rather than registration.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'The license statute has no wholesaling clause and no frequency threshold; application to repeated assignments depends on whether the owner exemption reaches equitable interests. No commission guidance was found.',
        sourceIds: ['s2'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to unlicensed persons soliciting the sale or purchase of a residential single-family home, for agreements entered or renewed after 2024-06-30. Excluded: persons offering to buy with intent to take title, record the deed, and hold as residence or investment.',
        sourceIds: ['s1'],
        items: [
          {
            audience: 'seller',
            description:
              'Every solicitation (mail, text, email, call, website, social media, signs, etc.) must state that it is not from a licensed real estate professional and give the legal name of the solicitor and of the expected purchaser if different. Written: legible and in plain sight; spoken: as clear and audible as the rest of the call.',
            timing: 'In every solicitation to buy or sell',
          },
          {
            audience: 'seller',
            description:
              'Tell the homeowner whether any information in the solicitation disclosure (e.g., the expected purchaser) has changed.',
            timing:
              'Before entering into a written agreement with the homeowner',
          },
          {
            audience: 'buyer',
            description:
              'The same not-a-licensee disclosure appears to apply to solicitations of a purchase (e.g., marketing to buyers) of a single-family home; counsel to confirm scope.',
            timing: 'In every solicitation',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'The 2024 statute treats advertising, websites and social media by unlicensed solicitors as permitted if the disclosure is included; whether marketing a property the wholesaler does not own is licensed activity under IC 25-34.1 is unresolved.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not specifically addressed. Solicitation includes phone, text and email, so the disclosure would likely apply where outreach solicits the purchase of a single-family home; the license question is the same as above.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'no',
        note: 'No statutory consent, notice or prohibition on assigning residential purchase contracts was found; the 2024 law regulates solicitation, not assignment.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Acts relating to real estate owned by the person are exempt from licensing, and a buyer who intends to take title and record the deed as an investment is outside the unlicensed-solicitor chapter. Marketing to end buyers before title passes raises the same unresolved license question.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only if the solicitation disclosure was missing or deficient: the homeowner may nullify the agreement by written rescission within two days of entering it, without liability. The statute says two days and does not say business days.',
        sourceIds: ['s1'],
        deadline: {
          days: 2,
          businessDays: false,
          trigger:
            'after the homeowner enters into the agreement (only where the solicitation disclosure was deficient)',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC registers with the Secretary of State using the Foreign Registration Statement (State Form 56369) and must name a registered agent.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'IC 32-21-16.5-1 to -6 (P.L.47-2024)',
        title:
          'Solicitation of Real Estate Sale or Purchase by an Unlicensed Real Estate Solicitor',
        url: 'https://iga.in.gov/ic/2026/Title_32/Article_21.pdf',
        type: 'statute',
        effectiveDate: '2024-07-01',
        summary:
          'Requires unlicensed solicitors of single-family home sales or purchases to disclose non-licensed status and legal names in all solicitations, allows rescission within two days for deficient disclosure, and makes violations a deceptive act enforceable by the Attorney General; applies to agreements entered or renewed after 2024-06-30.',
      },
      {
        id: 's2',
        citation: 'IC 25-34.1-1-2; IC 25-34.1-3-2',
        title:
          'Real estate licensing: definitions and transactions without license',
        url: 'https://iga.in.gov/ic/2026/Title_25/Article_34.1.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a license to sell, buy, trade, exchange, option or negotiate real estate for consideration, defines real estate as any interest in real property, and exempts acts relating to real estate the person owns.',
      },
      {
        id: 's3',
        citation: 'Indiana State Form 56369',
        title: 'Foreign Registration Statement',
        url: 'https://forms.in.gov/Download.aspx?id=17073',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Secretary of State form used by foreign entities, including LLCs, to register to do business in Indiana.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Is a contract purchaser's equitable interest 'real estate owned by that person' under IC 25-34.1-3-2(b)(8), so that assigning it is exempt from licensing?",
      'Does the 32-21-16.5 disclosure apply to outreach aimed at investor buyers, or only to homeowner-facing solicitations?',
      'Is the two-day rescission period counted in calendar days, and from signing or delivery?',
      'Has the Indiana Real Estate Commission issued any position on wholesaling? None was found.',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Add the exact statutory sentence plus the legal names of Halo (or the user-wholesaler) and the expected purchaser to every Indiana solicitation template, including scripts for calls and texts.',
      'Before any Indiana purchase agreement is signed, prompt the user to confirm to the homeowner whether the disclosed names have changed.',
      'Obtain an Indiana counsel opinion on the owner exemption before allowing repeated assignments.',
      'File the Foreign Registration Statement and appoint a registered agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'IA',
    name: 'Iowa',
    researchedAt: '2026-10-22',
    summary:
      "Iowa Code 543B.6A (2024 Iowa Acts ch. 1040, HF 2394) requires anyone engaged in wholesaling 1-4 unit residential property to be a licensed broker or be represented by one. Wholesalers must give all parties written disclosures and a copy of the executed agency agreement before contracting, and the commission's rules (193E ch. 22, effective 2025-06-18) add a mandatory statement. Violations carry civil penalties up to the greater of $10,000 or 10% of the sale price, and either party may cancel before closing.",
    proposedClassification: 'C',
    classificationRationale:
      'The statute expressly requires an Iowa broker license, or representation by an Iowa-licensed broker, to engage in wholesaling, and defines wholesaling as contracting with an owner to market and sell the equitable interest. Disclosures and an agency agreement are additional conditions.',
    regulator: {
      name: 'Iowa Real Estate Commission (Department of Inspections, Appeals, and Licensing)',
      url: 'https://dial.iowa.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Only if represented by an Iowa-licensed real estate broker; otherwise a broker license is required to engage in wholesaling residential property.',
        sourceIds: ['s1', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No separate wholesaler registration; the requirement is broker licensure or broker representation.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Required for wholesaling at all (no frequency threshold): a broker license or representation by a licensed broker.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to wholesaling of 1-4 unit residential property.',
        sourceIds: ['s1', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Written disclosure of the legal identities of all parties and an explanation of wholesaling, including that the wholesaler holds only an equitable interest and may not be able to convey title; rules add a mandatory statement that the transaction is real estate wholesaling.',
            timing:
              'Before executing a contract to purchase or convey the equitable interest',
          },
          {
            audience: 'buyer',
            description:
              'Same written disclosures to the end buyer or other entity receiving the equitable interest.',
            timing:
              'Before executing a contract to convey the equitable interest',
          },
          {
            audience: 'seller',
            description:
              'Copy of the executed agency agreement provided to all parties (seller and buyer).',
            timing:
              'Before executing a contract to purchase or convey the equitable interest',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'Wholesaling is defined as contracting with an owner to market and sell the equitable interest, and requires a license or broker representation.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'no',
        note: 'Any selling of the equitable interest is wholesaling under 543B.6A and needs a license or broker representation; no private-sale exception was found.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: 'Assigning a residential equitable interest requires licensure or broker representation, prior disclosures and the agency agreement copy.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: "543B.6A covers persons holding an equitable interest without legal title, suggesting a purchase that closes into the buyer before resale is outside it, but Iowa's general license exemptions for owners were not verified.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'If the wholesaler fails the disclosure requirement, the seller or the buyer may cancel any time before closing without penalty and may keep any earnest money paid by the wholesaler.',
        sourceIds: ['s1'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must register with the Secretary of State before doing business, naming an Iowa registered agent.',
        sourceIds: ['s4', 's5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Iowa Code 543B.6A',
        title: 'Wholesaling of residential property',
        url: 'https://www.legis.iowa.gov/docs/code/543B.6A.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires broker licensure or broker representation to wholesale 1-4 unit residential property, mandates disclosures and agency agreement copies, gives cancellation rights, and sets civil penalties.',
      },
      {
        id: 's2',
        citation: '2024 Iowa Acts ch. 1040 (H.F. 2394)',
        title: 'Wholesaling of Residential Property',
        url: 'https://www.legis.iowa.gov/docs/acts/2024/CH1040.pdf',
        type: 'statute',
        effectiveDate: null,
        summary: 'Session law creating 543B.6A, approved 2024-04-10.',
      },
      {
        id: 's3',
        citation: 'ARC 9252C, Iowa Admin. Code 193E ch. 22',
        title:
          'Real Estate Commission rules: wholesaling of residential property',
        url: 'https://rules.iowa.gov/Notice/Details/9252C',
        type: 'regulation',
        effectiveDate: '2025-06-18',
        summary:
          'Lets licensed brokers wholesale or represent unlicensed wholesalers with disclosures, including a mandatory statement that the transaction is wholesaling.',
      },
      {
        id: 's4',
        citation: 'Iowa Secretary of State',
        title: 'How to register a Foreign (not Iowa) entity in Iowa?',
        url: 'https://help.sos.iowa.gov/node/79',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Secretary of State help page on registering a foreign entity.',
      },
      {
        id: 's5',
        citation: 'Iowa Code ch. 489',
        title: 'Uniform Limited Liability Company Act',
        url: 'https://www.legis.iowa.gov/docs/code/2026/489.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires foreign LLCs to register before doing business and to maintain a registered agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "What does 'represented by a licensee' require in practice: a written brokerage agreement per deal, and must the broker be engaged before the seller contract?",
      'Does the civil penalty apply to the entity, its individual officers, or both?',
      'Is a purchase that closes into Halo before resale outside 543B.6A, and which owner exemption applies?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Engage an Iowa-licensed broker to represent Halo or its users in every Iowa wholesale, with an executed agency agreement copied to all parties before contracting.',
      'Add the 543B.6A disclosures and the 193E ch. 22 mandatory statement to seller and buyer documents, delivered before execution.',
      'Register as a foreign LLC with the Iowa Secretary of State and appoint a registered agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'KS',
    name: 'Kansas',
    researchedAt: '2026-10-22',
    summary:
      "Kansas has no wholesaling statute, but the Kansas Real Estate Commission's April 2026 guidance says a license is required to sell a contract interest or otherwise deal in options, or to market property one does not own. The statutory broker definition covers anyone who advertises or represents that they are in the business of buying or selling real estate, and dealing in options for compensation. A 2024 bill that would have prohibited dealing in assignable residential contracts died in committee.",
    proposedClassification: 'C',
    classificationRationale:
      "The regulator's published position is that selling a contract interest requires a Kansas license, and its 2024 testimony describes unlicensed advertising of a property under contract as a prohibited act. This rests on regulator interpretation of K.S.A. 58-3035 rather than an express wholesaling statute, and no court test was found.",
    regulator: {
      name: 'Kansas Real Estate Commission',
      url: 'https://krec.ks.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'no',
        note: 'KREC guidance (April 2026) states that selling a contract interest requires a license. This is regulator interpretation; the statute itself does not name assignments.',
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration; KREC says wholesaling is not specifically defined in Kansas law.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Per KREC: selling a contract interest, dealing in options, or marketing property one does not own requires a license. No frequency threshold.',
        sourceIds: ['s1', 's2', 's3'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No wholesaling disclosure statute; the 2024 bill that would have regulated the practice was not enacted.',
        sourceIds: ['s1', 's6'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: "KREC guidance: marketing someone else's property without owning it requires a license; KREC testimony cites a wholesaler advertising a property on social media as prohibited unlicensed activity.",
        sourceIds: ['s1', 's5'],
      },
      direct_investor_outreach_permitted: {
        answer: 'no',
        note: 'KREC treats selling a contract interest itself as licensed activity, regardless of audience.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No statutory consent or notice rule; regulator guidance treats selling a contract interest as requiring a license. An express statutory prohibition (Sub. HB 2598, 2024) was not enacted.',
        sourceIds: ['s1', 's6'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'K.S.A. 58-3037(a) exempts unlicensed persons acting on their own property, and KREC confirms selling property one owns needs no license; marketing before taking title is not covered.',
        sourceIds: ['s1', 's4'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign entity registers with the Secretary of State before doing business (application under K.S.A. 17-7931) and names a Kansas resident agent and registered office.',
        sourceIds: ['s8', 's9'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'KREC newsletter, April 14, 2026',
        title:
          'News from the Kansas Real Estate Commission (wholesaling guidance)',
        url: 'https://content.govdelivery.com/accounts/KSREC/bulletins/41118f6',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "States wholesaling is not defined in Kansas law but a license is needed to market property one does not own or to sell a contract interest or deal in options; selling one's own property needs none.",
      },
      {
        id: 's2',
        citation: 'K.S.A. 58-3035(f)',
        title: 'Definitions: broker',
        url: 'https://www.ksrevisor.gov/statutes/chapters/ch58/058_030_0035.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker to include anyone who advertises or represents being in the business of buying or selling real estate, or who for compensation deals in options or procures prospects on behalf of others.',
      },
      {
        id: 's3',
        citation: 'K.S.A. 58-3036',
        title: 'Licensure required',
        url: 'https://www.ksrevisor.gov/statutes/chapters/ch58/058_030_0036.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Prohibits acting as or holding out as a broker, or performing any listed broker act, without a license unless exempt.',
      },
      {
        id: 's4',
        citation: 'K.S.A. 58-3037',
        title: 'Exemptions',
        url: 'https://www.ksrevisor.gov/statutes/chapters/ch58/058_030_0037.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts unlicensed persons acting directly on their own property, among other exemptions.',
      },
      {
        id: 's5',
        citation: 'KREC testimony on HB 2598 (Jan. 31, 2024)',
        title: 'Testimony of the KREC Executive Director',
        url: 'https://www.kslegislature.gov/li_2024/b2023_24/committees/ctte_h_cmrce_lbr_1/documents/testimony/20240131_05.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Describes wholesaling and cites advertising a property under contract without a license as prohibited, while supporting a bill to bar offering equitable interests and give KREC cease-and-desist power.',
      },
      {
        id: 's6',
        citation: 'Sub. for HB 2598 (2023-2024)',
        title:
          'Substitute for HB 2598 - assignable contracts, cease and desist',
        url: 'https://kslegislature.gov/archive/b2023_24/bills/HB2598/',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would have prohibited dealing in assignable contracts for certain residential real estate; reported by committee in February 2024 with no further action shown.',
      },
      {
        id: 's7',
        citation: 'KREC newsletter, January 26, 2022',
        title: 'Unlicensed Activity Legislation (SB 382)',
        url: 'https://content.govdelivery.com/accounts/KSREC/bulletins/307aff8',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Announced a Commission-requested bill to require a license for patterns of selling equitable interests; current 58-3035 to 58-3037 histories show no such amendment.',
      },
      {
        id: 's8',
        citation: 'K.S.A. 17-7931',
        title: 'Foreign covered entities: application for registration',
        url: 'https://ksrevisor.gov/statutes/chapters/ch17/017_079_0031.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires foreign covered entities to register with the Secretary of State before doing business, naming a resident agent.',
      },
      {
        id: 's9',
        citation: 'Kansas SOS Form FA instructions',
        title: 'Instructions for filing foreign business application',
        url: 'https://sos.ks.gov/forms/business_services/FA.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Explains resident agent and registered office requirements for foreign entity registration.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'Sub. for HB 2598',
        session: '2023-2024',
        status:
          'Reported by House Commerce, Labor and Economic Development 2024-02-15; no further action shown; not enacted',
        url: 'https://kslegislature.gov/archive/b2023_24/bills/HB2598/',
        summary:
          'Would have prohibited dealing in assignable contracts for certain residential real estate under the consumer protection act and given KREC cease-and-desist authority. Watch for reintroduction.',
      },
    ],
    openQuestions: [
      "Would a Kansas court uphold KREC's view that assigning one's own purchase contract is a licensed act under K.S.A. 58-3035(f)?",
      "Can a licensed Kansas broker market Halo's contract interests, and what agency documents would KREC expect?",
      'Has any 2025 or 2026 Kansas bill on wholesaling or KREC cease-and-desist authority been introduced? None found.',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Do not run unlicensed Kansas assignments; either obtain a Kansas broker license or have a Kansas-licensed broker handle contract marketing and sale.',
      'Consider a purchase-and-resale model where Halo or its user takes title before any marketing.',
      'Register as a foreign entity with the Kansas Secretary of State and appoint a resident agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'KY',
    name: 'Kentucky',
    researchedAt: '2026-10-22',
    summary:
      "Since June 29, 2023 (HB 62, 2023 Ky. Acts ch. 84), Kentucky treats advertising for sale an equitable interest in a seller-buyer purchase contract as real estate brokerage, and it is unlawful for an unlicensed person to do it. Otherwise real estate brokerage covers acts done for others for a fee. A principal's private, unadvertised assignment is not expressly addressed. No wholesaler disclosure, registration or cancellation statute was found.",
    proposedClassification: 'D',
    classificationRationale:
      "KRS 324.020(1)(b) and 324.010(1)(b) bar unlicensed advertising of a contract's equitable interest, which restricts public marketing of contracts. The underlying brokerage definition is limited to acts done for others, and the statute does not prohibit a principal's assignment as such. So a structure that avoids unlicensed advertising (licensed brokerage participation, or purchase and resale after taking title) may work. Whether private outreach counts as 'advertising' is unresolved.",
    regulator: {
      name: 'Kentucky Real Estate Commission',
      url: 'https://krec.ky.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Brokerage under KRS 324.010(1)(a) means the listed acts done for others for a fee, so a principal's own assignment is not expressly brokerage. Advertising the equitable interest is reserved to licensees (324.020(1)(b)). The owner exemption (324.030(1)) speaks of property owned or leased, which may not include a contract interest.",
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'The 2023 legislation brought advertising of equitable interests under the license law; no separate wholesaler registration was found.',
        sourceIds: ['s2', 's4'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'A license is required to advertise an equitable interest in a purchase contract for sale, as wholesaling is typically practised. There is no transaction-count threshold: the brokerage definition says a single act suffices. Effective June 29, 2023.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling-specific disclosure statute was found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'It is unlawful for a person who is not a licensed broker or sales associate to advertise for sale an equitable interest in a contract between a property owner and a prospective purchaser.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: "'Advertise' is not defined in the sections reviewed. Whether one-to-one or closed-list outreach to known investors counts as advertising is unresolved.",
        sourceIds: ['s2'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statute restricting assignment of residential purchase contracts as such was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "This is a lead only. Once title is taken, the owner exemption in 324.030(1) covers an owner's acts concerning property owned, as part of managing and investing in it. Marketing before closing would still be advertising an equitable interest.",
        sourceIds: ['s3', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific cancellation right was found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'The Kentucky Secretary of State states that each entity must designate a Kentucky registered agent and office, and that entities transacting business file an annual report by June 30. The foreign certificate-of-authority statute (KRS Chapter 14A) was not retrieved, and tax registration was not researched.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'KRS 324.010',
        title: 'Definitions for chapter (real estate brokerage)',
        url: 'https://apps.legislature.ky.gov/LAW/STATUTES/statute.aspx?id=53889',
        type: 'statute',
        effectiveDate: '2023-06-29',
        summary:
          'Brokerage is defined as acts for others for a fee, and expressly includes advertising for sale an equitable interest in a purchase contract.',
      },
      {
        id: 's2',
        citation: '2023 Ky. Acts ch. 84 (HB 62), amending KRS 324.020',
        title: 'AN ACT relating to real estate brokerage',
        url: 'https://apps.legislature.ky.gov/law/acts/23RS/documents/0084.pdf',
        type: 'statute',
        effectiveDate: '2023-06-29',
        summary:
          'Makes it unlawful for an unlicensed person to advertise for sale an equitable interest in an owner-buyer purchase contract; signed March 23, 2023.',
      },
      {
        id: 's3',
        citation: 'KRS 324.030',
        title: 'Exceptions to KRS 324.020',
        url: 'https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=31548',
        type: 'statute',
        effectiveDate: '2000-07-14',
        summary:
          'Exempts owners or lessors acting regarding property they own or lease in the course of managing and investing in it.',
      },
      {
        id: 's4',
        citation: 'KREC meeting minutes, March 2023',
        title:
          'Kentucky Real Estate Commission March meeting minutes (legal report on HB 62)',
        url: 'https://www.krec.ky.gov/Documents/3. KREC March Meeting Minutes - Approved Signed.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "General counsel described HB 62 as the 'wholesaling' bill, noted its timing and planned a licensee reminder on advertising.",
      },
      {
        id: 's5',
        citation: 'Kentucky Secretary of State, Business Filings',
        title: 'Business Filings',
        url: 'https://www.sos.ky.gov/bus/business-filings/Pages/default.aspx',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Entities must designate a Kentucky registered agent and office and file annual reports by June 30.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "What counts as 'advertise' under KRS 324.020(1)(b)? Does it include emails to a curated investor list, a gated online marketplace, or MLS-style syndication?",
      'Does advertising the property itself, rather than the contract, by a contract holder fall within the prohibition?',
      "Can a principal that never advertises assign contracts repeatedly without a license, given the 'for others' wording in 324.010(1)(a)?",
      'Does the owner exemption in 324.030(1) cover an equitable-interest holder?',
      'Has KREC brought enforcement actions or issued written guidance on wholesaling since 2023?',
    ],
    activationSteps: [
      'Route any Kentucky contract marketing through a Kentucky-licensed principal broker, or hold a license.',
      'Disable public listing of Kentucky contract interests on the platform for unlicensed users.',
      'Have counsel define what investor outreach is permissible before enabling direct-to-investor contract marketing.',
      'Register the LLC with the Kentucky Secretary of State and appoint a Kentucky registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'LA',
    name: 'Louisiana',
    researchedAt: '2026-10-22',
    summary:
      "Act 807 of the 2026 Regular Session (HB 468), effective August 1, 2026, regulates wholesaling of 1-4 unit residential property under R.S. 37:1431(35)-(37) and 37:1448.5. Wholesalers must disclose their intent and the seller's rights before each contract, include a statutory cancellation notice and the LREC cancellation form, and post a deposit of at least 1% held in escrow. Sellers may cancel for at least five calendar days, and violations make the contract voidable before title transfer. The Act defines wholesaling to include simultaneous double closings without full purchaser funding, treats marketing of contract rights as a presumption of wholesaling, and does not require a license or registration.",
    proposedClassification: 'B',
    classificationRationale:
      'Act 807 regulates wholesalers through disclosures, contract terms, a five-calendar-day cancellation right, deposit and escrow rules, and conduct prohibitions. Violations are enforceable by the Attorney General and LREC, with civil penalties up to $5,000 per violation. It does not require a license or registration, and the general license law defines real estate activity as acts for another. Unlicensed principal wholesaling appears permitted with conditions, though LREC has not been seen to address licensing directly.',
    regulator: {
      name: 'Louisiana Real Estate Commission',
      url: 'https://www.lrec.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Act 807 regulates 'wholesalers' without requiring a license. It imposes disclosures, a cancellation right, a deposit and escrow, and conduct rules, and violations are enforceable by LREC and the Attorney General. Under R.S. 37:1431, real estate activity covers acts for another for compensation. No LREC statement on licensing was found.",
        sourceIds: ['s1', 's3', 's4'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'Act 807 contains no wholesaler registration.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Act 807 imposes no license requirement. Counsel should confirm that platform marketing and negotiating do not amount to acting for another under R.S. 37:1431. No frequency threshold applies; the Act covers any person engaged in or intending to engage in wholesaling.',
        sourceIds: ['s1', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'R.S. 37:1448.5 (Act 807 of 2026), effective August 1, 2026, applying to 1-4 unit residential property. Missing disclosures or other violations make the contract voidable by the seller at any time before title transfer. It does not apply to contracts completed before the effective date.',
        sourceIds: ['s1', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Prominent written disclosure that the wholesaler intends to assign or sell its contract rights or equitable interest for more than the seller is offered, or will otherwise market them for gain.',
            timing:
              'Before execution of each related contract or written agreement',
          },
          {
            audience: 'seller',
            description:
              'Written statement that the seller should seek legal advice before signing.',
            timing:
              'Before execution of each related contract or written agreement',
          },
          {
            audience: 'seller',
            description:
              "Written disclosure of the seller's right to cancel for any reason, without penalty, for at least five calendar days after execution.",
            timing:
              'Before execution of each related contract or written agreement',
          },
          {
            audience: 'seller',
            description:
              "The contract must show the cancellation date and time in the statutory 'NOTICE REQUIRED BY LOUISIANA LAW' near the seller's signature, and include the LREC mandatory cancellation notice form at no cost.",
            timing: 'In and with each contract',
          },
          {
            audience: 'seller',
            description:
              "The contract must include a deposit of at least 1% of the purchase price, held in the seller's account or an in-state escrow account at a federally insured institution.",
            timing: 'At contract',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Act 807 does not prohibit marketing; marketing contract rights creates a presumption that the marketer is a wholesaler subject to the Act. No license-law bar on public marketing was found.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Permitted subject to Act 807 compliance; not separately restricted in any source found.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: "Act 807 requires pre-contract disclosure of the intent to assign. Wholesalers may not act as the seller's advisor or under a mandate or power of attorney, claim licenses they lack, record liens or otherwise cloud title, or engage in unlawful real estate service agreements under R.S. 51:1429. Violations allow the seller to void the contract and carry penalties up to $5,000 each.",
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Act 807 includes simultaneous double closings within 'wholesaling' when the purchaser does not provide all funds for the first closing and does not intend to occupy or materially improve the property. Such deals carry the full duties. A fully funded acquisition and resale may fall outside that clause but could still meet the general definition.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: "The seller may cancel for any reason without penalty for at least five calendar days after the later of the seller's or wholesaler's execution. On a timely cancellation the wholesaler gets its deposit back. On a violation the contract is voidable until title transfers and the seller keeps the deposit.",
        sourceIds: ['s1', 's3'],
        deadline: {
          days: 5,
          businessDays: false,
          trigger:
            'after the later of execution by the seller or the wholesaler',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC files an Application of Foreign Limited Liability Company for Certificate of Authority with a home-state good standing certificate less than 90 days old, appoints a registered agent with a physical Louisiana address, and files annual reports. Tax registration was not researched.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'HB 468 (2026 RS), enrolled; Act 807 of 2026; R.S. 37:1431(35)-(37), 37:1448.5',
        title: 'Enrolled HB 468: wholesale of residential real properties',
        url: 'https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1479446',
        type: 'statute',
        effectiveDate: '2026-08-01',
        summary:
          'Defines wholesaling (including unfunded double closings), mandates seller disclosures, a five-day cancellation, a 1% escrowed deposit and conduct bans; enforced by LREC and the Attorney General.',
      },
      {
        id: 's2',
        citation: 'HB 468 (2026 RS) bill history',
        title: 'HB468 bill information',
        url: 'https://www.legis.la.gov/legis/BillInfo.aspx?s=26RS&b=HB468&sbi=y',
        type: 'bill',
        effectiveDate: '2026-08-01',
        summary:
          'Signed by the Governor June 9, 2026 as Act 807; effective August 1, 2026.',
      },
      {
        id: 's3',
        citation: 'LREC announcement, July 28, 2026',
        title:
          'New Wholesaling Residential Real Property Mandatory Cancellation Notice Now Available',
        url: 'https://lrec.gov/blog/new-wholesaling-residential-real-property-mandatory-cancellation-notice-now-available',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'LREC adopted the mandatory cancellation notice form required by Act 807; the form is posted under mandatory forms.',
      },
      {
        id: 's4',
        citation: 'La. R.S. 37:1431',
        title: 'Definitions (real estate license law)',
        url: 'https://www.legis.la.gov/Legis/Law.aspx?d=93260',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Real estate activity means listed acts, including dealing in options, performed for another for compensation; the page fetched predates Act 807's new paragraphs.",
      },
      {
        id: 's5',
        citation: 'Louisiana Secretary of State, Business Services FAQs',
        title: 'Frequently Asked Questions',
        url: 'https://www.sos.la.gov/business-services/frequently-asked-questions',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLCs file an application for certificate of authority with a recent good standing certificate and a Louisiana registered agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does LREC consider repeated marketing of contract interests by an unlicensed wholesaler to be 'real estate activity' for another, apart from Act 807?",
      'How should the five-day cancellation window interact with assignment timing? May the wholesaler market during the window?',
      "Does a fully funded double closing fall outside Act 807's definition of wholesaling?",
      'Do Act 807 duties apply to licensees acting as principals?',
      'Are there parish or municipal rules, for example in New Orleans, affecting wholesaling? None was found.',
    ],
    activationSteps: [
      "Build a Louisiana seller contract package containing the three pre-execution disclosures, the 'NOTICE REQUIRED BY LOUISIANA LAW' block with cancellation date and time, and the attached LREC mandatory cancellation notice form.",
      "Require a deposit of at least 1% of price, held in the seller's account or an in-state federally insured escrow account.",
      'Block assignment closing and any seller-signed conveyance until the five-calendar-day cancellation window has ended.',
      "Never record memoranda or liens against Louisiana seller property, and never present as the seller's advisor.",
      'Obtain a certificate of authority from the Louisiana Secretary of State and appoint a Louisiana registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'ME',
    name: 'Maine',
    researchedAt: '2026-10-22',
    summary:
      'No Maine wholesaling statute or 2025-2026 wholesaling bill was found. 32 M.R.S. section 13001 defines real estate brokerage as services on behalf of another for compensation, including buying or selling options. Secondary sources say no license is needed to assign contracts but warn against marketing the property itself.',
    proposedClassification: 'A',
    classificationRationale:
      'The brokerage definition requires acting on behalf of another, and no wholesaler registration, disclosure or cancellation law was found, which fits classification A, with the usual condition of marketing the contract rather than the property. Confidence is low because no Maine Real Estate Commission guidance was located.',
    regulator: {
      name: 'Maine Real Estate Commission (Office of Professional and Occupational Regulation)',
      url: 'https://www.maine.gov/pfr/professionallicensing/professions/real-estate-commission',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Section 13001 limits brokerage to services on behalf of another for compensation. Secondary sources say assigning contracts needs no license if the wholesaler markets the contract rather than the property.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration found in chapter 114 or bills reviewed.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Required when providing brokerage services for another for compensation, including option dealing; no principal threshold found.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure statute found; general disclosure duties were not reviewed.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Secondary sources: market the sale of the contract, not the property itself.',
        sourceIds: ['s2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Appears permitted for a principal offering its own contract interest, based on secondary sources and the 'on behalf of another' definition.",
        sourceIds: ['s1', 's2'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'None found; not researched beyond the licensing chapter.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Buying and reselling for one's own account is not brokerage on behalf of another.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific right found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: '31 M.R.S. section 1622: a foreign LLC may not conduct activities in Maine until its statement of foreign qualification is filed with the Secretary of State; section 1629 sets the consequences of failing to qualify.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: '32 M.R.S. section 13001',
        title: 'Definitions (Real Estate Brokerage License Act)',
        url: 'https://legislature.maine.gov/statutes/32/title32sec13001.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines real estate brokerage as services on behalf of another for compensation, including buying or selling real estate options.',
      },
      {
        id: 's2',
        citation: 'Ark7 guide',
        title: 'Maine Real Estate Wholesaling Guide',
        url: 'https://ark7.com/blog/learn/cities/maine-real-estate-wholesaling-guide/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide (seen in search results) saying no license is needed to assign contracts in Maine if the contract, not the property, is marketed.',
      },
      {
        id: 's3',
        citation: '31 M.R.S. section 1622',
        title:
          'Statement of foreign qualification to conduct activities required',
        url: 'https://www.legislature.maine.gov/statutes/31/title31sec1622.docx',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to file a statement of foreign qualification before conducting activities in Maine (seen in search results).',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Has the Maine Real Estate Commission addressed contract assignment or property marketing by unlicensed principals?',
      'Are there Maine consumer-protection rules for purchases from owners in foreclosure that apply to wholesale contracts?',
    ],
    activationSteps: [
      'File a statement of foreign qualification with the Maine Secretary of State and appoint a registered agent.',
      'Obtain counsel confirmation of the principal-assignment position.',
      "Market only the contract interest, never the property on the owner's behalf.",
    ],
    confidence: 'low',
  },
  {
    code: 'MD',
    name: 'Maryland',
    researchedAt: '2026-10-22',
    summary:
      'Chapter 508 of 2025 (HB 124 / SB 160), effective October 1, 2025, added Real Property section 10-715. Before contracting, a wholesale buyer must tell the owner in writing that it may assign the contract, and before assigning, the wholesale seller must tell the assignee it holds only an equitable interest and may not be able to convey title. Missing notices give the owner and the assignee rescission rights before closing. The statute imposes no license or registration, but the broker definition (Business Occupations 17-101(l)) includes regularly dealing in real estate or options for consideration, and homeowners in default have a 5-day rescission right under Real Property 7-310.',
    proposedClassification: 'B',
    classificationRationale:
      "Maryland's wholesaling statute permits assignment subject to written notices to the owner and the assignee and rescission remedies, which is classification B. The main risk is whether the Real Estate Commission treats a repeat wholesaler as 'engaging regularly in a business of dealing in real estate', which would push the state toward C; no guidance was found.",
    regulator: {
      name: 'Maryland Real Estate Commission (Maryland Department of Labor)',
      url: 'https://labor.maryland.gov/license/mrec/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Section 10-715 regulates wholesale assignments through notices and does not require a license. But section 17-101(l) counts as brokerage, among other things, engaging regularly in a business of dealing in real estate, leases or options; its application to repeat wholesalers is unresolved.',
        sourceIds: ['s1', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'Section 10-715 contains no registration requirement, and none was found elsewhere.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "No wholesaling-specific license rule. Risk: 'regularly' dealing in real estate or options for consideration is a brokerage service under 17-101(l)(3); there is no numeric threshold. The Commission's site showed no wholesaling guidance.",
        sourceIds: ['s3', 's6'],
      },
      disclosures_required: {
        answer: 'yes',
        note: "Real Property 10-715, effective 2025-10-01; the bill also amended section 14-117 (contract-of-sale requirements), not reviewed. Per the statute page, the 'wholesale buyer' definition refers to owner-occupied residential property of four or fewer units; confirm scope.",
        sourceIds: ['s1', 's2'],
        items: [
          {
            audience: 'seller',
            description:
              'Written notice to the property owner that the wholesale buyer may assign the contract of sale to another person.',
            timing: 'Before the contract of sale is executed',
          },
          {
            audience: 'buyer',
            description:
              'Written disclosure to the prospective assignee that the wholesale seller holds an equitable interest in the property and may not be able to convey title.',
            timing: 'Before the assignment',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Section 10-715 has no marketing restriction. The licensing risk under 17-101(l) applies, and (l)(4) separately covers a business of promoting sales through real estate listing publications. No guidance found.',
        sourceIds: ['s1', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Permitted under 10-715 with the assignee disclosure; same 17-101(l)(3) caveat for repeat activity.',
        sourceIds: ['s1', 's3'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: 'Assignment requires the prior owner notice and assignee disclosure. If the owner was not notified and the contract is assigned, the owner may cancel without penalty before closing; if the assignee was not notified, it may rescind before closing and recover its deposit. Foreclosure sales under the Maryland Rules are excluded.',
        sourceIds: ['s1', 's2'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Section 10-715 governs assignments, not purchase and resale. A double close appears lawful, subject to the 17-101(l)(3) regular-dealing question and to Real Property 7-310 when the seller's home is in default.",
        sourceIds: ['s1', 's3', 's4'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Under 10-715, only if the owner notice was not given and the contract is assigned (any time before closing; no fixed period). Separately, under Real Property 7-310, a homeowner selling a residence in default may rescind within 5 days after signing; the statute text as summarized does not say business days, so calendar days are assumed here.',
        sourceIds: ['s1', 's4'],
        deadline: {
          days: 5,
          businessDays: false,
          trigger:
            'after the homeowner executes the contract (residence in default only, Real Property 7-310)',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'Baltimore City and county rules were not researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'Corporations and Associations 4A-1002: a foreign LLC must register with the State Department of Assessments and Taxation before doing business and appoint a Maryland resident agent.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Md. Code, Real Property section 10-715',
        title:
          'Residential property - assignment of contracts of sale (wholesale buyer and wholesale seller)',
        url: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=10-715&enactments=false',
        type: 'statute',
        effectiveDate: '2025-10-01',
        summary:
          'Requires an assignment notice to the owner before contracting and an equitable-interest disclosure to the assignee before assigning, with rescission and deposit refund remedies.',
      },
      {
        id: 's2',
        citation: 'Md. HB 124 (2025 RS), Chapter 508, cross-filed SB 160',
        title:
          'Residential Property - Assignment of Contracts of Sale - Disclosure Requirements and Rescission',
        url: 'https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/hb0124?ys=2025RS',
        type: 'bill',
        effectiveDate: '2025-10-01',
        summary:
          'Passed unanimously and approved May 13, 2025; amends Real Property 10-715 and 14-117.',
      },
      {
        id: 's3',
        citation:
          'Md. Code, Business Occupations and Professions section 17-101',
        title: 'Definitions (provide real estate brokerage services)',
        url: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gbo&section=17-101&enactments=false',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Brokerage services include, among others, engaging regularly in a business of dealing in real estate, leases or options; no wholesaling definition.',
      },
      {
        id: 's4',
        citation: 'Md. Code, Real Property section 7-310',
        title: 'Rescission rights for sale of a residence in default',
        url: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=7-310&enactments=false',
        type: 'statute',
        effectiveDate: null,
        summary:
          'A homeowner of a residence in default may rescind a sale contract within 5 days after execution; deeds may not be recorded during that period.',
      },
      {
        id: 's5',
        citation: 'Md. Code, Corporations and Associations section 4A-1002',
        title: 'Registration of foreign limited liability companies',
        url: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gca&section=4A-1002&enactments=false',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to register with the Department before doing business in Maryland and to appoint a resident agent.',
      },
      {
        id: 's6',
        citation: 'Maryland Real Estate Commission',
        title: 'Maryland Real Estate Commission home page',
        url: 'https://labor.maryland.gov/license/mrec/',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Commission page reviewed 2026-10-22; it contained no wholesaling guidance or notices.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Is section 10-715 limited to owner-occupied residential property, and what form must the notices take (separate document, font, signature)?',
      'What did Chapter 508 add to Real Property 14-117 (contract-of-sale content)?',
      "Does the Real Estate Commission treat a repeat assignment business as 'engaging regularly in a business of dealing in real estate, leases, or options' under 17-101(l)(3)?",
      "Is the 7-310 rescission period calendar or business days, and which sellers are 'in default' under the foreclosure-protection subtitle?",
      'Do Baltimore City or other counties regulate investor solicitation of homeowners? (A scan of 2026 session bill titles found no new wholesaling bill, but the scan may be incomplete.)',
    ],
    activationSteps: [
      'Add the 10-715 owner notice to every Maryland purchase agreement process (signed before contract execution) and the assignee equitable-interest disclosure to every assignment.',
      'Screen for homes in default and apply the 7-310 rescission and no-recording rules, or exclude them.',
      'Obtain counsel or Commission confirmation on 17-101(l)(3) before scaling volume; otherwise route through a Maryland-licensed broker.',
      'Register the LLC with SDAT and appoint a resident agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'MA',
    name: 'Massachusetts',
    researchedAt: '2026-10-22',
    summary:
      'No Massachusetts wholesaling statute and no 2025-2026 wholesaling bill was identified. The broker definition in G.L. c. 112 section 87PP requires acting for another person for a fee, which supports principal assignment without a license; secondary sources agree, but no Board guidance was found. Attorney General regulation 940 CMR 25.00 makes foreclosure rescue transactions for compensation an unfair or deceptive act, which needs checking for deals with distressed owners.',
    proposedClassification: 'A',
    classificationRationale:
      "The statute text requires acting for another, no wholesaling-specific registration, disclosure or cancellation law was found, and a secondary source states no dedicated wholesaling legislation exists, which fits classification A. Confidence is low because the Board's position is unverified and the scope of 940 CMR 25.00 for distressed homeowners was not confirmed.",
    regulator: {
      name: 'Massachusetts Board of Registration of Real Estate Brokers and Salespersons',
      url: 'https://www.mass.gov/orgs/board-of-registration-of-real-estate-brokers-and-salespersons',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Section 87PP covers listed activities only when done for another person and for a fee. A secondary guide says a license is not explicitly required for wholesaling. No Board guidance found.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration found; the secondary source says no Massachusetts legislation directly addresses wholesaling.',
        sourceIds: ['s2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'A license is required when acting for another for a fee (selling, negotiating, listing, advertising as engaged in the business). No frequency threshold was found for principals.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No wholesaling-specific disclosure law found. Distressed-owner transactions may be subject to 940 CMR 25.00 (not fully reviewed).',
        sourceIds: ['s2', 's3'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: "No rule specific to wholesalers was found. Inference from the 'for another' definition only: marketing one's own contract interest is arguably not brokerage, but advertising oneself as engaged in selling real estate for others is.",
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Same inference: offering the company's own contract interest to known investors is not acting for another. Unverified by guidance.",
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory assignment restrictions were researched or found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Buying and reselling for one's own account is not acting for another; a secondary guide describes double closings as used in Massachusetts.",
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific cancellation right found. Whether 940 CMR 25.00 or other consumer law gives distressed sellers rescission rights was not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'G.L. c. 156C section 48: a foreign LLC doing business in Massachusetts must file an application for registration with the Secretary of the Commonwealth within ten days of starting business, with a resident agent and a home-state good standing certificate; the form lists a $500 fee.',
        sourceIds: ['s4', 's5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Mass. G.L. c. 112, section 87PP',
        title: 'Definitions (real estate broker)',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXVI/Chapter112/Section87PP',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a real estate broker by activities performed for another person and for a fee, commission or other consideration.',
      },
      {
        id: 's2',
        citation: 'Ark7 guide (January 2026)',
        title: 'Massachusetts Real Estate Wholesaling Guide',
        url: 'https://ark7.com/blog/learn/cities/massachusetts-real-estate-wholesaling-guide/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide stating Massachusetts has no wholesaling-specific legislation and a license is not explicitly required, and describing double closings.',
      },
      {
        id: 's3',
        citation: '940 CMR 25.00',
        title:
          'Foreclosure rescue transactions and foreclosure related services',
        url: 'https://www.mass.gov/regulations/940-CMR-2500-foreclosure-rescue-transactions-and-foreclosure-related-services',
        type: 'regulation',
        effectiveDate: null,
        summary:
          'Attorney General regulation (seen in search results) making it unfair or deceptive to arrange or carry out a foreclosure rescue transaction for compensation or gain.',
      },
      {
        id: 's4',
        citation: 'Mass. G.L. c. 156C, section 48',
        title: 'Foreign limited liability company registration',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter156c/Section48',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to register with the state secretary within ten days after it begins doing business in Massachusetts.',
      },
      {
        id: 's5',
        citation: 'Secretary of the Commonwealth, Corporations Division',
        title:
          'Foreign Limited Liability Company Application for Registration (form)',
        url: 'https://www.sec.state.ma.us/divisions/corporations/download/c156cs48fllcregistration.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Official registration form including resident agent consent; listed fee $500.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Has the Board of Registration or any court addressed repeated contract assignment or property marketing by a principal wholesaler?',
      'How does 940 CMR 25.00 define a foreclosure rescue transaction, and does a straight purchase-and-assign from an owner facing foreclosure fall inside it?',
      'Are there any 2025-2026 bills in the 194th General Court on wholesaling that the title searches missed?',
      'Any city-level rules (e.g., Boston) on investor solicitation of homeowners?',
    ],
    activationSteps: [
      'Register the LLC with the Secretary of the Commonwealth within ten days of starting business and appoint a resident agent.',
      'Obtain counsel confirmation that principal assignment is outside c. 112 section 87PP and on the reach of 940 CMR 25.00.',
      'Exclude or specially review owners in foreclosure until 940 CMR 25.00 is cleared.',
      "Market only the company's contract interest; do not hold out as brokering property for owners.",
    ],
    confidence: 'low',
  },
  {
    code: 'MI',
    name: 'Michigan',
    researchedAt: '2026-10-22',
    summary:
      'Michigan has no wholesaling statute in force. The Occupational Code defines a real estate broker by intent to collect a fee for selling, buying or negotiating real estate, and exempts owners unless acting as a principal vocation without a licensed broker. HB 5366 (introduced December 2025, in committee) would make real estate wholesaling licensed activity and add seller disclosures with a 5-business-day cancellation right.',
    proposedClassification: 'E',
    classificationRationale:
      "Current statute neither names wholesaling nor clearly excludes it, the owner exemption's reach to equitable interests is unsettled, and no regulator guidance was found. A pending bill would move Michigan toward category C. There is not enough verified information to classify.",
    regulator: {
      name: 'Michigan Department of Licensing and Regulatory Affairs (LARA), Bureau of Professional Licensing',
      url: 'https://www.michigan.gov/lara',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "Broker is defined by intent to collect a fee for selling, buying or negotiating real estate; the owner exemption excludes acting as a principal vocation without a licensed broker. Whether assigning one's own contract interest falls inside is unresolved; no LARA guidance found.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'None in current law; the pending bill proposes licensing rather than registration.',
        sourceIds: ['s1', 's3'],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'No express wholesaling clause or numeric threshold in current law. HB 5366 would define real estate wholesaling as licensed activity.',
        sourceIds: ['s1', 's3', 's4'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'None in current law. HB 5366 proposes a written disclosure to sellers (assignor status, expected resale price or assignment fee, 5-business-day cancellation right).',
        sourceIds: ['s4'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed in current law. HB 5366 would deny the owner exemption to anyone who, as owner, advertises or assigns an equitable interest to the public.',
        sourceIds: ['s4'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory assignment restriction found in current law.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Owners selling their own property are exempt unless selling is their principal vocation without a licensed broker; a high-volume buy-and-resell business may lose the exemption.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None found in current law; HB 5366 proposes a 5-business-day cancellation right.',
        sourceIds: ['s4'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: "A foreign LLC obtains a Certificate of Authority from LARA's Corporations Division (form CSCL/CD-760), with a Michigan registered office and resident agent.",
        sourceIds: ['s5', 's6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'MCL 339.2501(u)',
        title: 'Occupational Code, Article 25 definitions (real estate broker)',
        url: 'https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-339-2501',
        type: 'statute',
        effectiveDate: '2024-07-25',
        summary:
          'Defines a real estate broker as one who, intending to collect a fee, sells, buys, lists or negotiates real estate, or who as owner or otherwise sells real estate as a principal vocation.',
      },
      {
        id: 's2',
        citation: 'MCL 339.2503(1)',
        title: 'Article 25 exemptions',
        url: 'https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-339-2503',
        type: 'statute',
        effectiveDate: '2017-03-29',
        summary:
          'Exempts owners acting on their own property unless performed as a principal vocation not through a licensed broker.',
      },
      {
        id: 's3',
        citation: '2025 HB 5366',
        title:
          'Occupations: real estate; real estate wholesaling and mandatory disclosures',
        url: 'https://www.legislature.mi.gov/Bills/Bill?ObjectName=2025-HB-5366',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Introduced 2025-12-16 and referred to the House Committee on Government Operations; no later action shown.',
      },
      {
        id: 's4',
        citation: '2025 HB 5366 (introduced text)',
        title: 'HB 5366 as introduced',
        url: 'https://www.legislature.mi.gov/documents/2025-2026/billintroduced/House/pdf/2025-HIB-5366.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          "Would define real estate wholesaling as advertising, marketing or negotiating assignment of a buyer's interest in 1-4 unit property, treat it as licensed activity, remove the owner exemption for public marketing of equitable interests, and require disclosures including a 5-business-day cancellation right.",
      },
      {
        id: 's5',
        citation: 'LARA form CSCL/CD-760',
        title:
          'Application for Certificate of Authority to Transact Business (foreign LLC)',
        url: 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/cscl/NonImages_new/Corps/forms/llc/760-0725.pdf?rev=a274429ea6484be5903a60cf6aec2776&hash=B2B7752267BEDE8DA6058BB38061C79B',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLC application requiring a Michigan registered office and resident agent and a home-jurisdiction certificate.',
      },
      {
        id: 's6',
        citation: 'LARA Corporations Division',
        title: 'Resident Agent and Registered Office',
        url: 'https://www.michigan.gov/lara/bureau-list/cscl/corps/limited-liability-co/filing/resident-agent-and-registered-office',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Explains the resident agent and registered office requirement for LLCs.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 5366',
        session: '2025-2026',
        status:
          'Introduced 2025-12-16; referred to House Committee on Government Operations',
        url: 'https://www.legislature.mi.gov/Bills/Bill?ObjectName=2025-HB-5366',
        summary:
          'Would make real estate wholesaling of 1-4 unit residential property licensed activity, remove the owner exemption for public marketing of equitable interests, and require seller disclosures including assignment fee and a 5-business-day cancellation right.',
      },
    ],
    openQuestions: [
      "Does assigning one's own purchase contract for a fee make a person a 'real estate broker' under MCL 339.2501(u) today?",
      'Does LARA have any enforcement history or guidance on wholesaling? None was found.',
      "At what volume does buying and reselling become a 'principal vocation' outside the owner exemption?",
      'Will HB 5366 move in the 2026 session?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Obtain a Michigan counsel opinion on MCL 339.2501(u) and 339.2503 before enabling Michigan assignments.',
      'Monitor HB 5366; if enacted, plan for a licensed Michigan broker partner and the new seller disclosure.',
      'Obtain a Certificate of Authority (CSCL/CD-760) and a Michigan resident agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    researchedAt: '2026-10-22',
    summary:
      'No Minnesota wholesaling statute, registration or disclosure rule was found. The broker definition centres on acting for another for compensation, but also covers anyone engaged in the business of selling real estate, presumed when a person acts as principal in five or more transactions in 12 months unless represented by a licensed broker. How that presumption applies to contract assignments was not resolved.',
    proposedClassification: 'E',
    classificationRationale:
      "The verified statutes leave the key question open: if assignments are 'transactions' in the business of selling real estate, a high-volume wholesaler is presumed a broker after five in 12 months (category C or B with broker representation); if not, Minnesota may be category A. No regulator guidance was found, so E.",
    regulator: {
      name: 'Minnesota Department of Commerce (Real Estate licensing)',
      url: 'https://mn.gov/commerce/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'The main broker clause requires acting for another, so a single principal assignment may fall outside it; repeated activity is caught by the five-transactions-in-12-months presumption unless a licensed broker represents the person.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'None found in Chapter 82 or in searches for Minnesota wholesaling bills.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Presumed broker if engaged as principal in 5 or more transactions in any 12 months, unless represented by a licensed broker or salesperson; whether assignments count is unresolved.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling-specific disclosure found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'The for-another clause includes advertising or holding out as engaged in brokerage activities; application to a principal advertising its own contract is not resolved.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'None found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The business-of-selling clause applies whether or not the person owns the real estate, with the 5-in-12-months presumption; representation by a licensed broker avoids the presumption.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC files an application for a certificate of authority with the Secretary of State naming a Minnesota registered office and agent.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Minn. Stat. 82.55, subd. 19',
        title: 'Real estate broker definition',
        url: 'https://www.revisor.mn.gov/statutes/cite/82.55',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker mainly by acting for another for compensation, and also covers anyone in the business of selling real estate, presumed at 5+ principal transactions in 12 months unless represented by a licensee.',
      },
      {
        id: 's2',
        citation: 'Minn. Stat. 82.56',
        title: 'Exemptions from licensing',
        url: 'https://www.revisor.mn.gov/statutes/cite/82.56',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Lists licensing exemptions; the portion reviewed included a builder-resale exemption capped at 25 transactions per 12 months and no exemption specific to contract assignors was identified.',
      },
      {
        id: 's3',
        citation: 'Minn. Stat. 322C.0802',
        title: 'Application for certificate of authority (foreign LLC)',
        url: 'https://www.revisor.mn.gov/statutes/cite/322C.0802',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to apply to the Secretary of State with its registered office and agent in Minnesota.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Is an assignment of a purchase agreement a 'transaction' in the 'business of selling real estate' for the subd. 19(g) presumption?",
      'Does the Department of Commerce have any guidance or enforcement history on wholesaling? None found.',
      'Would representation by a licensed Minnesota broker on each deal fully remove the presumption for a high-volume wholesaler?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Obtain a Minnesota counsel opinion on 82.55 subd. 19(g) before enabling repeated assignments.',
      'Pending that opinion, cap Minnesota activity below 5 transactions per 12 months per entity, or have a licensed Minnesota broker represent the wholesaler.',
      'Obtain a certificate of authority and a Minnesota registered agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'MS',
    name: 'Mississippi',
    researchedAt: '2026-10-22',
    summary:
      "No Mississippi wholesaling statute, bill or Real Estate Commission guidance was found. The general broker definition in Miss. Code 73-35-3 covers anyone who, for a fee or its expectation, sells or purchases any real estate including options, with an exemption for a bona fide owner acting regarding property it owns. Whether a contract buyer assigning its interest is a 'bona fide owner' or is performing broker acts is unresolved. The 2026 amendments to 73-35-3 (SB 2748, effective July 1, 2026) did not address wholesaling.",
    proposedClassification: 'E',
    classificationRationale:
      'The license-law text is broad: it is not limited to acting for others in the language reviewed, and it expressly includes options. The owner exemption is framed around a bona fide owner of property. No regulator guidance, case law or wholesaling statute was found to resolve how these apply to contract assignment, so there is not enough verified information to classify the market.',
    regulator: {
      name: 'Mississippi Real Estate Commission',
      url: 'https://www.mrec.ms.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: '73-35-3 covers persons who, for a fee or its expectation, sell or purchase any real estate including options. The exemption is for a bona fide owner acting regarding property owned. Neither has been applied to equitable contract interests in any source found.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No registration statute was found, but the Mississippi search was limited.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'Not resolved. The broker definition also covers advertising or holding out and procuring prospects for compensation, which may reach marketing a contract.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling-specific disclosure statute was found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed in any source found.',
        sourceIds: [],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed in any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statute found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: 'The bona fide owner exemption may cover resale after taking title; not confirmed.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statute found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'The Mississippi Secretary of State directs out-of-state LLCs to register through the online filing system with a home-state certificate of good standing, and LLC annual reports are due April 15. Registered-agent rules and tax registration were not verified.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Miss. Code 73-35-3 (as printed in SB 2748, 2026 RS, introduced)',
        title:
          'SB 2748 introduced text showing 73-35-3 (real estate broker definition; owner exemption)',
        url: 'https://billstatus.ls.state.ms.us/documents/2026/html/SB/2700-2799/SB2748IN.htm',
        type: 'bill',
        effectiveDate: '2026-07-01',
        summary:
          'Broker includes persons who for a fee sell or purchase real estate including options. A bona fide owner acting regarding owned property is exempt.',
      },
      {
        id: 's2',
        citation: 'SB 2748 (2026 RS) history',
        title: 'SB 2748 bill status',
        url: 'https://billstatus.ls.state.ms.us/2026/pdf/history/SB/SB2748.xml',
        type: 'bill',
        effectiveDate: '2026-07-01',
        summary:
          "Approved by the Governor March 13, 2026; revises broker definitions (adds 'brokerage agreement') without addressing wholesaling.",
      },
      {
        id: 's3',
        citation: 'Mississippi Secretary of State, Business FAQs',
        title: 'Business FAQs',
        url: 'https://www.sos.ms.gov/business-services/business-faqs',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Out-of-state LLCs register online with a home-state certificate of good standing, and annual reports are due April 15 for LLCs.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does MREC consider assignment of a purchase contract for a fee to be 'selling ... real estate, including options' under 73-35-3?",
      "Is a contract buyer a 'bona fide owner' for the 73-35-3 exemption?",
      'Has MREC issued any wholesaling guidance or brought enforcement? The MREC website could not be reached during research.',
      'Did the enacted SB 2748 change the broker-definition text relied on here?',
      'Were any 2025 or 2026 Mississippi wholesaling bills introduced? None was found, but the search was limited.',
    ],
    activationSteps: [
      'Obtain a Mississippi counsel opinion on 73-35-3 before launching assignment-based wholesaling.',
      'Pending that opinion, use a Mississippi-licensed broker for marketing, or a principal purchase and resale.',
      'Register the LLC with the Mississippi Secretary of State and calendar the April 15 annual report.',
    ],
    confidence: 'low',
  },
  {
    code: 'MO',
    name: 'Missouri',
    researchedAt: '2026-10-22',
    summary:
      'Missouri enacted RSMo 407.3600 through SB 973 (2026), effective 2026-08-28. A wholesaler buying 1-4 unit residential property must give the owner a separate, boldface, signed statutory disclosure at least 14 calendar days before entering into a contract, or the owner may cancel before closing; violations are unlawful practices under the Merchandising Practices Act. The statute creates no license or registration, and the broker license law is framed around acting for another.',
    proposedClassification: 'B',
    classificationRationale:
      '407.3600 expressly contemplates wholesalers assigning or novating residential contracts for a fee and conditions the practice on a pre-contract disclosure with a 14-day lead time, plus cancellation and consumer-fraud remedies. No licensing requirement was found for principals acting for themselves, though counsel should confirm marketing practices under RSMo 339.010.',
    regulator: {
      name: 'Missouri Real Estate Commission',
      url: 'https://pr.mo.gov/realestate.asp',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Permitted subject to the 407.3600 disclosure. The broker definition in RSMo 339.010 applies to acting for another for compensation, and owners acting on their own property are excluded; no regulator guidance on wholesaling was found.',
        sourceIds: ['s1', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'SB 973 created disclosure duties only.',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'No express wholesaling clause or threshold in RSMo 339.010, which is framed around acting for another; the definition also lists dealing in options and assisting in procuring prospects. Commission position not found.',
        sourceIds: ['s3'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to wholesalers acting as grantee (and their representatives) for 1-4 unit residential property; excludes assignments to relatives within the third degree or to affiliates under common control; cannot be waived.',
        sourceIds: ['s1'],
        items: [
          {
            audience: 'seller',
            description:
              "Separate written disclosure statement, boldface, at least 12-point, in the statutory wording: buyer is a wholesaler acting for itself, may assign without the owner's consent, may charge the third party a fee, price may be below market value, owner is advised to seek legal advice. Signed and dated by owner and wholesaler.",
            timing:
              'At least 14 calendar days before entering into the contract; no binding contract until signed',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed by 407.3600; RSMo 339.010 covers advertising as a licensed broker while in the business and acting for another. No guidance found.',
        sourceIds: ['s3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No consent requirement (the statutory form says the wholesaler may assign without consent), but the 14-day pre-contract disclosure is a precondition.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Owners acting on property they own are outside the license law; 407.3600 targets assignment or novation, so a purchase that closes into the buyer appears outside it, but a grantor who resells without holding title and assigns is covered.',
        sourceIds: ['s1', 's3'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only if the disclosure was not made: the owner may cancel at any time before close of escrow without penalty, and earnest money paid by the wholesaler goes to the owner within 30 days.',
        sourceIds: ['s1'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search (St. Louis and Kansas City not confirmed).',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC registers with the Secretary of State (Form LLC-4) and maintains a Missouri registered agent and office.',
        sourceIds: ['s5', 's6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'RSMo 407.3600',
        title: 'Disclosure statement, residential real property (wholesalers)',
        url: 'https://revisor.mo.gov/main/OneSection.aspx?section=407.3600',
        type: 'statute',
        effectiveDate: '2026-08-28',
        summary:
          'Requires wholesalers to give a separate signed boldface disclosure at least 14 calendar days before contracting, allows cancellation before closing if not given, bars waiver, and makes violations unlawful practices with a private action.',
      },
      {
        id: 's2',
        citation: 'SB 973 (2026), truly agreed and finally passed',
        title: 'CCS HCS SS SCS SB 973, 103rd General Assembly',
        url: 'https://www.senate.mo.gov/26info/pdf-bill/tat/SB973.pdf',
        type: 'bill',
        effectiveDate: '2026-08-28',
        summary:
          'Real estate transactions act that enacted 407.3600 and the Residential Sale Leaseback Protection Act among other changes; revisor shows 407.3600 effective 2026-08-28.',
      },
      {
        id: 's3',
        citation: 'RSMo 339.010',
        title: 'Real estate broker definitions and exemptions',
        url: 'https://revisor.mo.gov/main/OneSection.aspx?section=339.010',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as one who acts for another for compensation, including dealing in options and procuring prospects, and excludes owners acting on property they own.',
      },
      {
        id: 's4',
        citation: 'HB 2517 (2026) perfected summary',
        title: 'HB 2517 bill summary',
        url: 'https://documents.house.mo.gov/billtracking/bills261/sumpdf/HB2517P.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'House wholesaler disclosure bill with the same 14-day disclosure concept, reported in search results as passing the House in April 2026.',
      },
      {
        id: 's5',
        citation: 'RSMo 347.153',
        title: 'Foreign limited liability company registration',
        url: 'https://revisor.mo.gov/main/OneSection.aspx?section=347.153',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires foreign LLCs to register with the Secretary of State before transacting business.',
      },
      {
        id: 's6',
        citation: 'Missouri SOS Form LLC-4',
        title:
          'Application for Registration of a Foreign Limited Liability Company',
        url: 'https://www.sos.mo.gov/CMSImages/Business/llc4.pdf?v=2',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLC registration form requiring a Missouri registered agent with a street address.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 2517',
        session: '2026',
        status:
          'Passed the House per search results (April 2026); comparable provisions were enacted through SB 973, so final disposition of HB 2517 itself was not verified',
        url: 'https://documents.house.mo.gov/billtracking/bills261/sumpdf/HB2517P.pdf',
        summary:
          'Wholesaler disclosure bill requiring a signed disclosure 14 days before contracting, with cancellation remedy.',
      },
    ],
    openQuestions: [
      'Was SB 973 signed or did it take effect without signature? The revisor lists 407.3600 as effective 2026-08-28, but governor action was not separately checked.',
      'Does the 14-day period run from delivery of the disclosure or from signature, and can an offer be negotiated during the 14 days?',
      'Does the Missouri Real Estate Commission treat public advertising of a contract interest by a principal as brokerage?',
      'Do St. Louis or Kansas City have local rules affecting wholesalers?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Build a Missouri flow that delivers the 407.3600 disclosure as a separate boldface document and blocks contract execution until 14 calendar days have passed and both parties have signed it.',
      'Remove any waiver of 407.3600 rights from Missouri templates.',
      'Register as a foreign LLC (Form LLC-4) with a Missouri registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'MT',
    name: 'Montana',
    researchedAt: '2026-10-22',
    summary:
      "No Montana wholesaling statute or Board of Realty Regulation guidance was found. MCA 37-51-102 defines a broker to include an individual who, for another or for valuable consideration, negotiates the sale of real estate, and one who makes real estate advertising available by public display to buyers; real estate includes any interest in land. The owner exemption (MCA 37-51-103) covers property owned, leaving a contract purchaser's position unclear.",
    proposedClassification: 'E',
    classificationRationale:
      "The disjunctive 'for another or for valuable consideration' wording and the inclusion of any interest in land mean an unlicensed party negotiating the sale of its contract interest for a fee may fall within the broker definition, but no Board guidance or case confirms either reading. Insufficient information to classify.",
    regulator: {
      name: 'Montana Board of Realty Regulation',
      url: 'https://boards.bsd.dli.mt.gov/realty-regulation/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: 'MCA 37-51-102 covers anyone who, for another or for valuable consideration, negotiates the sale of real estate, and real estate includes any interest in land; the owner exemption (37-51-103) covers only property owned. A contract purchaser assigning for a fee may be covered; no Board guidance found.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'The broker definition includes making real estate advertising available by public display to potential buyers and aiding persons to locate real estate for a fee; treat as high risk pending counsel review.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'MCA 37-51-102 lists making real estate advertising available by public display to buyers as broker activity; whether that reaches a principal advertising its contract interest is untested.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'MCA 37-51-103 exempts an owner performing broker acts with reference to property it owns, which supports resale after taking title; counsel to confirm.',
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC may not transact business in Montana until it obtains a certificate of authority from the Secretary of State (MCA 35-8-1001).',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'MCA 37-51-102',
        title: 'MCA 37-51-102 - Definitions',
        url: 'https://mca.legmt.gov/bills/mca/title_0370/chapter_0510/part_0010/section_0020/0370-0510-0010-0020.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker to include negotiating real estate sales for another or for valuable consideration and publicly displaying real estate advertising; real estate includes any interest in land; amended 2023.',
      },
      {
        id: 's2',
        citation: 'MCA 37-51-103',
        title: 'MCA 37-51-103 - License exemptions',
        url: 'https://mca.legmt.gov/bills/mca/title_0370/chapter_0510/part_0010/section_0030/0370-0510-0010-0030.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts owners and lessors acting with reference to their own property, among other exemptions.',
      },
      {
        id: 's3',
        citation: 'MCA 35-8-1001',
        title: 'MCA 35-8-1001 - Foreign LLC certificate of authority',
        url: 'https://mca.legmt.gov/bills/mca/title_0350/chapter_0080/part_0100/section_0010/0350-0080-0100-0010.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to obtain a certificate of authority before transacting business in Montana.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does the Board of Realty Regulation read 'for another or for valuable consideration' to cover a principal negotiating the sale of its own contract interest?",
      'Were any wholesaling bills introduced in the 2025 Montana session? None were found in this pass.',
      'Any Montana foreclosure-purchaser statute with seller cancellation rights?',
    ],
    activationSteps: [
      'Do not launch Montana until counsel resolves the licensing question.',
      'Obtain a Montana certificate of authority for the foreign LLC.',
      'Consider a Montana-licensed broker partner or a take-title-then-resell model.',
    ],
    confidence: 'low',
  },
  {
    code: 'NE',
    name: 'Nebraska',
    researchedAt: '2026-10-22',
    summary:
      "Nebraska requires a real estate license to publicly market an equitable interest in a purchase contract (other than a vacant lot), added by LB 892 (2022) and amended by LB 187 (2025). The owner exemption expressly excludes equitable interests, and the broker definition is not limited to acting for another. Commission Policy 42 sets agency forms, an Assignable Contract Addendum and advertising rules for licensees who market a wholesaler's contract interest.",
    proposedClassification: 'C',
    classificationRationale:
      'Public marketing of a contract interest is statutorily brokerage, the owner exemption does not cover equitable interests, and the Commission states that any single listed act is brokerage. Wholesaling as typically practised therefore needs a license or a licensed broker. Taking title before marketing, or using a licensed broker under Policy 42, are possible alternatives.',
    regulator: {
      name: 'Nebraska Real Estate Commission',
      url: 'https://nrec.nebraska.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'At most a privately negotiated assignment that is never publicly marketed, and even that is uncertain: the broker definition covers negotiating a sale for compensation without a for-another limit, and the owner exemption excludes equitable interests.',
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No separate wholesaler registration; the requirement is a real estate license.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Publicly marketing for sale an equitable interest in a purchase contract (other than a vacant lot) is brokerage requiring a license; the Commission says a single act suffices.',
        sourceIds: ['s1', 's5'],
      },
      disclosures_required: {
        answer: 'conditional',
        note: "Statutory wholesaler disclosures were not found; the Commission's Policy 42 imposes disclosures when a licensee markets a wholesaler's contract interest.",
        sourceIds: ['s5'],
        items: [
          {
            audience: 'seller',
            description:
              "Agency disclosure (customer only) plus Assignable Contract Addendum signed by the title owner acknowledging the equitable interest is marketed for the wholesaler's profit, which the owner does not share unless the contract says so.",
            timing:
              'At first substantial contact; marketing without the addendum is a disciplinary violation',
          },
          {
            audience: 'buyer',
            description:
              'Agency disclosure and Assignable Contract Addendum signed by unrepresented buyers; seller property condition disclosure delivered to the purchaser of the contract interest.',
            timing: 'At first substantial contact with the buyer',
          },
          {
            audience: 'buyer',
            description:
              'Advertisements must clearly state that an assignable purchase contract is being marketed.',
            timing: 'In every advertisement',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'Publicly marketing an equitable interest is brokerage requiring a license (vacant lots excepted since LB 187).',
        sourceIds: ['s1', 's4'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: "The statute's express clause targets public marketing, but the general broker definition and the exclusion of equitable interests from the owner exemption may reach private negotiation for compensation. Counsel must decide.",
        sourceIds: ['s2', 's3'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: 'Owner exemption excludes equitable interests and public marketing of them is brokerage; licensees must use the Assignable Contract Addendum and obtain owner authorization for showings, ads and signs.',
        sourceIds: ['s1', 's2', 's5'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Once title is taken, the owner exemption covers sale of owned property in the course of its investment; marketing to buyers before closing is marketing an equitable interest.',
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory cancellation right for wholesale contracts found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC applies to the Secretary of State for a certificate of authority with a current certificate of existence and designates a Nebraska agent for service of process.',
        sourceIds: ['s7', 's8'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Neb. Rev. Stat. 81-885.02',
        title: 'License required; activities included',
        url: 'https://nebraskalegislature.gov/laws/statutes.php?statute=81-885.02',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Makes publicly marketing an equitable interest in a purchase contract, other than a vacant lot, an act requiring a broker or salesperson license (Laws 2022, LB 892; Laws 2025, LB 187).',
      },
      {
        id: 's2',
        citation: 'Neb. Rev. Stat. 81-885.04(1)',
        title: 'Exceptions; owner exemption',
        url: 'https://nebraskalegislature.gov/laws/statutes.php?statute=81-885.04',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts owners acting on owned property but states an equitable interest is not an ownership interest for this purpose (Laws 2022, LB 892).',
      },
      {
        id: 's3',
        citation: 'Neb. Rev. Stat. 81-885.01(2)',
        title: 'Definition of broker',
        url: 'https://nebraskalegislature.gov/laws/statutes.php?statute=81-885.01',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker as anyone who for compensation negotiates a sale, purchase or option of real estate or procures prospects, without a for-another limitation, and includes dealing in options.',
      },
      {
        id: 's4',
        citation: 'LB 187 (2025), Final Reading',
        title: 'Legislative Bill 187, 109th Legislature',
        url: 'https://nebraskalegislature.gov/FloorDocs/109/PDF/Final/LB187.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Amended 81-885.02 to exclude vacant lots from the equitable-interest marketing clause, with an emergency clause.',
      },
      {
        id: 's5',
        citation: 'NREC Policies and Interpretations, No. 42',
        title:
          'Procedures and Guidelines for Marketing an Equitable Interest in Real Property',
        url: 'https://nrec.nebraska.gov/sites/default/files/doc/Legal/License%20Manual%20PDF/8licensemanualpolicyint.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "Sets agency, addendum, condition-disclosure and advertising rules for licensees marketing a wholesaler's contract interest and states that any single broker act requires a license.",
      },
      {
        id: 's6',
        citation: 'LB 892 (2022)',
        title: 'Legislative Bill 892, 107th Legislature',
        url: 'https://www.NebraskaLegislature.gov/FloorDocs/107/PDF/Final/LB892.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Added the equitable-interest public marketing clause to 81-885.02 and amended the owner exemption in 81-885.04; approved in 2022.',
      },
      {
        id: 's7',
        citation: 'Neb. Rev. Stat. 21-156',
        title: 'Foreign LLC application for certificate of authority',
        url: 'https://nebraskalegislature.gov/laws/statutes.php?statute=21-156',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to apply for a certificate of authority and designate an agent for service of process.',
      },
      {
        id: 's8',
        citation: 'Nebraska SOS form',
        title: 'Application for Certificate of Authority (LLC)',
        url: 'https://sos.nebraska.gov/sites/default/files/doc/business-services/Corporations/Forms/ApplicationForCertificateofAuthorityLLC.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary: 'Secretary of State foreign LLC application form.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Can a principal privately negotiate the sale of its contract interest to a known investor without a license, given 81-885.01(2) and the equitable-interest carve-out in 81-885.04(1)?',
      "What counts as 'publicly' marketing: an email list of registered investors, a gated platform listing, a social media post?",
      "Does LB 187's vacant-lot exception matter for Halo's product scope?",
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      "Route all Nebraska contract marketing through a Nebraska-licensed broker following Policy 42 (limited seller's agency, Assignable Contract Addendum, ad wording, owner authorizations).",
      'Alternatively, have Halo or its user take title before any marketing (purchase and resale).',
      'Do not show Nebraska contract interests on any public or broadly accessible listing without a licensee.',
      'Obtain a Nebraska certificate of authority and appoint an agent for service of process.',
    ],
    confidence: 'medium',
  },
  {
    code: 'NV',
    name: 'Nevada',
    researchedAt: '2026-10-22',
    summary:
      "Nevada has no wholesaler-specific statute as found; NRS 645.030 limits broker activity to acts for another for compensation, and a single act suffices (NRS 645.260). However, the Real Estate Division filed a 2022 complaint treating an LLC's assignment of a residential purchase agreement for an assignment fee as unlicensed brokerage under NRS 645.230(a); the case settled by stipulation without admission. AB 312 (2025) on sales of real property died in committee.",
    proposedClassification: 'D',
    classificationRationale:
      "The statute's 'for another' language favors principal assignments, but the regulator has pursued an assignment-fee wholesale scheme as unlicensed brokerage, so assignment-and-market practices carry real enforcement risk. Taking title and reselling fits the owner exemption more comfortably, which is why D (restricted practice, alternative structure may work) is proposed rather than A. Confidence is low because the enforcement theory was never adjudicated.",
    regulator: {
      name: 'Nevada Real Estate Division (Department of Business and Industry)',
      url: 'https://red.nv.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: 'NRS 645.030 defines a broker as one acting for another for compensation, which supports principal assignments, but the Division charged an assignment-fee wholesaler (acting through an LLC) with unlicensed brokerage under NRS 645.230(a), describing the conduct as acting as a marketing intermediary. The matter settled without admission, so the legal question is unresolved.',
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'NRS chapter 645 was reviewed and contains no wholesaler registration provision.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "A license is required for any single act within the broker definition (NRS 645.260); the Division's Powell complaint indicates it may view repeated assign-for-fee activity as brokerage. No frequency threshold found.",
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling-specific disclosure statute found. The Powell complaint faulted the failure to tell the seller and end buyer about the assignment fees and a known title defect, which signals disclosure expectations in enforcement.',
        sourceIds: ['s2'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: "No statute or guidance addresses an unlicensed principal advertising a property held under contract; given the Division's enforcement theory, treat as high risk.",
        sourceIds: ['s2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found; the Powell matter involved assignment to an investor buyer and then to an end buyer.',
        sourceIds: ['s2'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assigning residential purchase agreements was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'NRS 645.0445(1)(a) exempts an owner performing broker acts with respect to its own property in the course of investment; holding title before resale fits this exemption, subject to counsel review for anti-evasion concerns.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must register with the Secretary of State before transacting business (NRS 86.544), with a registered agent and initial list; a state business license is also reported as required.',
        sourceIds: ['s4', 's5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'NRS 645.030, 645.0445, 645.230, 645.260',
        title: 'NRS Chapter 645 - Real Estate Brokers and Salespersons',
        url: 'https://www.leg.state.nv.us/nrs/nrs-645.html',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as one acting for another for compensation (including options), makes unlicensed brokerage unlawful, treats a single act as sufficient, and exempts owners dealing with their own property.',
      },
      {
        id: 's2',
        citation:
          "Chandra v. Powell, Nev. Real Estate Comm'n Case No. 2020-401, First Amended Complaint (Aug. 17, 2022)",
        title: 'First Amended Complaint and Notice of Hearing, Case 2020-401',
        url: 'https://red.nv.gov/uploadedFiles/rednvgov/Content/Meetings/REC/2023/Supporting_Materials/May/Powell-Ronald_2020-401_First-Amended-Complaint.pdf',
        type: 'case',
        effectiveDate: null,
        summary:
          'Division alleged that an LLC owner who assigned a residential purchase agreement for an assignment fee acted as a broker without a license in violation of NRS 645.230(a).',
      },
      {
        id: 's3',
        citation:
          "Nev. Real Estate Comm'n Case No. 2020-401, Stipulation and Order for Settlement (Feb. 2023 orders)",
        title:
          'Stipulation and Order for Settlement of Disciplinary Action, Powell',
        url: 'https://red.nv.gov/uploadedFiles/rednvgov/Content/Meetings/REC/2023/Orders/February/Powell-%20Ronald_2020-401.pdf',
        type: 'case',
        effectiveDate: null,
        summary:
          'The Powell matter was settled by stipulation without the respondent admitting the alleged NRS 645.230(a) violation.',
      },
      {
        id: 's4',
        citation: 'NRS 86.544',
        title: 'NRS 86.544 - Registration of foreign limited-liability company',
        url: 'https://nevada.public.law/statutes/nrs_86.544',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to register with the Secretary of State before transacting business in Nevada and lists application contents.',
      },
      {
        id: 's5',
        citation: 'Harbor Compliance, Nevada foreign LLC registration',
        title: 'Nevada Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-nevada-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports foreign LLC fees in Nevada, including an initial list fee and a state business license fee.',
      },
      {
        id: 's6',
        citation: 'Nev. AB 312 (83rd Sess., 2025)',
        title:
          'AB 312 - Revises provisions governing the sale of real property',
        url: 'https://open.pluralpolicy.com/nv/bills/83/AB312',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Bill on sales of real property referred to Judiciary; no further action allowed after 2025-04-12 under Joint Standing Rule 14.3.1.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'AB 312',
        session: '2025 (83rd)',
        status:
          'Died: no further action allowed after 2025-04-12 under Joint Standing Rule 14.3.1.',
        url: 'https://open.pluralpolicy.com/nv/bills/83/AB312',
        summary:
          'Revises provisions governing the sale of real property; whether it addressed wholesaling was not verified (bill page could not be fetched).',
      },
    ],
    openQuestions: [
      "Does the Real Estate Division currently treat an unlicensed principal's assignment of a residential purchase agreement for a fee as brokerage under NRS 645.230? What happened in the related Wynn matter (Case No. 2019-1122)?",
      'Is public or private marketing of a contract interest by an unlicensed principal treated as acting for another in Nevada?',
      'Do Nevada foreclosure-related statutes (for example NRS chapter 645F) give sellers cancellation rights or regulate purchases of homes in foreclosure?',
      'Any Clark County or Las Vegas rules affecting residential purchase solicitations?',
    ],
    activationSteps: [
      'Register the LLC with the Nevada Secretary of State and obtain a state business license.',
      "Obtain Nevada counsel's opinion on assignment-fee transactions in light of the Powell complaint before using assignments.",
      'Prefer taking title (closing as buyer) before resale, or partner with a Nevada-licensed broker for marketing.',
      'Disclose the assignment fee and all known property and title defects in writing to both seller and end buyer.',
    ],
    confidence: 'low',
  },
  {
    code: 'NH',
    name: 'New Hampshire',
    researchedAt: '2026-10-22',
    summary:
      'No New Hampshire wholesaling statute or wholesaling bill was found. RSA 331-A:2 defines a broker as one acting for another for compensation (or a licensee acting for itself), and RSA 331-A:4 exempts non-licensee owners and non-licensee prospective purchasers. HB 1110 (2026, chapter 21) amended the practice act, but its summary does not mention wholesaling.',
    proposedClassification: 'A',
    classificationRationale:
      'The broker definition requires acting for another, unlicensed owners and prospective purchasers are exempt, and no wholesaling-specific registration, disclosure or cancellation law was found, which fits classification A. Note the twist that a licensee acting for itself is treated as a broker, so a licensed entity would bring its own deals under licensing rules. Confidence is low: no Real Estate Commission guidance was found.',
    regulator: {
      name: 'New Hampshire Real Estate Commission (Office of Professional Licensure and Certification)',
      url: 'https://www.oplc.nh.gov/real-estate-commission',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'RSA 331-A:2 covers acts for another for compensation; RSA 331-A:4 exempts non-licensee owners and non-licensee prospective purchasers. A contract buyer assigning its own position appears outside licensing, but the definition includes assisting in procuring prospects, so how the assignment is marketed matters. No commission guidance found.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration found in RSA 331-A or 2025-2026 bills reviewed.',
        sourceIds: ['s1', 's3'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Required when acting for another for compensation (including dealing in options and procuring prospects). No transaction cap on the owner or purchaser exemptions was found.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure statute found; general disclosure duties were not reviewed.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Inference only: a non-licensee principal marketing its own contract interest is not acting for another, but holding out as procuring buyers for owners is brokerage.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Same inference as public marketing; unverified by guidance.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'None found; not researched beyond the licensing chapter.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Owner exemption in RSA 331-A:4 supports buying and reselling one's own property without a license.",
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific right found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'RSA 304-C:175: a foreign LLC must register with the Secretary of State before doing business, with a New Hampshire registered office and agent; secondary sources report Form FLLC-1 ($100) plus Form SRA ($50).',
        sourceIds: ['s5', 's6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'RSA 331-A:2',
        title: 'Definitions (broker)',
        url: 'https://gc.nh.gov/rsa/html/XXX/331-A/331-A-2.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as one acting for another for compensation, or a licensee acting for itself, in selling, buying, listing, negotiating, dealing in options or procuring prospects.',
      },
      {
        id: 's2',
        citation: 'RSA 331-A:4',
        title: 'Exemptions',
        url: 'https://gc.nh.gov/rsa/html/XXX/331-A/331-A-4.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts non-licensee owners and their employees, non-licensee prospective purchasers or lessees, fiduciaries, attorneys and others.',
      },
      {
        id: 's3',
        citation: 'NH HB 1110 (2026), chapter 21',
        title: 'Relative to the New Hampshire real estate practice act',
        url: 'https://gc.nh.gov/bill_Status/billinfo.aspx?id=1760',
        type: 'bill',
        effectiveDate: '2026-06-02',
        summary:
          'Signed amendment to the real estate practice act, effective June 2, 2026.',
      },
      {
        id: 's4',
        citation: 'Citizens Count bill summary',
        title: 'HB 1110 (2026)',
        url: 'https://www.citizenscount.org/bills/hb-1110-2026',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Summarizes HB 1110 as clarifying education hours, exempting inactive brokers from bonds, and barring rental discrimination, without mention of wholesaling.',
      },
      {
        id: 's5',
        citation: 'RSA 304-C:175',
        title: 'Registration required (foreign limited liability companies)',
        url: 'https://gc.nh.gov/rsa/html/XXVIII/304-C/304-C-175.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to register with the Secretary of State before doing business in New Hampshire (seen in search results).',
      },
      {
        id: 's6',
        citation: 'Harbor Compliance',
        title: 'New Hampshire Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-new-hampshire-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide reporting Form FLLC-1, the $100 fee and the accompanying Form SRA.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Has the NH Real Estate Commission addressed contract assignment by unlicensed principals, or treated marketing to end buyers as 'procuring prospects' for the seller?",
      'Confirm the full text of HB 1110 (2026) does not touch wholesaling or the exemptions.',
      'If the company later holds a NH license, does RSA 331-A:2 then subject all its own principal deals to licensee duties?',
    ],
    activationSteps: [
      'Register the LLC with the NH Secretary of State (Form FLLC-1 and Form SRA) and appoint a registered agent.',
      'Obtain counsel confirmation of the principal-purchaser exemption.',
      "Market only the company's contract interest; avoid procuring buyers on the seller's behalf.",
    ],
    confidence: 'low',
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    researchedAt: '2026-10-22',
    summary:
      "No enacted New Jersey wholesaling statute was found as of 2026-10-22. The broker definition in N.J.S.A. 45:15-3 (seen only in search snippets) covers acts for others for a fee, and secondary sources treat assignment of one's own contract as outside licensing if the property itself is not brokered. Assembly Bill A4278, introduced February 19, 2026, would copy Pennsylvania's model: license required for wholesale transactions, four contract disclosures, and a 30-day non-waivable consumer cancellation right.",
    proposedClassification: 'A',
    classificationRationale:
      'On the sources found, an unlicensed principal can assign its own contract and no wholesaling-specific disclosure or registration is in force, which is classification A. Confidence is low because the official statute text was not fetched and no Real Estate Commission guidance was found. If A4278 is enacted the state would move to C, so the market should be built with that change in mind.',
    regulator: {
      name: 'New Jersey Real Estate Commission (Department of Banking and Insurance)',
      url: 'https://www.nj.gov/dobi/division_rec/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Secondary sources say a license is not needed to sell one's equitable interest in a contract, but marketing the property for another or negotiating for someone else creates enforcement risk. The owner exemption in N.J.S.A. 45:15-4 and the 'for others' wording of 45:15-3 were seen only in search snippets, not fetched.",
        sourceIds: ['s2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration scheme found. Pending A4278 would require a real estate license, not a separate registration.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Under current law a license is tied to acting for others. A4278 would require a broker, salesperson or broker-salesperson license for anyone conducting a wholesale transaction in 1-4 unit residential property, with no frequency threshold.',
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No enacted wholesaling disclosure found. A4278 would require the contract to state that it is a wholesale transaction, the right to an appraisal or independent advice, the cancellation right, and the refund timeline.',
        sourceIds: ['s1'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Secondary guidance: market the contract position, not the property as if brokering it. No statute or Commission guidance found.',
        sourceIds: ['s2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Appears permitted for a principal offering its own contract interest, based on secondary guidance only.',
        sourceIds: ['s2'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory restriction on assigning residential purchase contracts was found; a secondary source advises using an express assignability clause. Contract-law requirements were not verified.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Secondary guidance describes double closings as a permissible structure (the wholesaler buys and then sells). The owner exemption for bona fide owners supports this, but the official text was not fetched.',
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'No enacted wholesale-specific seller cancellation right was found. The three-business-day attorney review period reported in search results applies to contracts prepared by licensees, not to principal-to-principal contracts (unverified). A4278 would add a 30-day right.',
        sourceIds: ['s1'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal wholesaler or homeowner-solicitation ordinances were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must register with the Division of Revenue and Enterprise Services (certificate of authority / foreign registration), keep a New Jersey registered agent, and file annual reports; tax registration (NJ-REG) was not verified.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'N.J. Assembly Bill A4278 (2026-2027 session), introduced 2026-02-19',
        title: 'Real estate contracts for wholesale transactions',
        url: 'https://pub.njleg.state.nj.us/Bills/2026/A4500/4278_I1.HTM',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would require licensure for wholesale transactions, mandate four contract disclosures, and create a non-waivable 30-day consumer cancellation right, effective the fourth month after enactment.',
      },
      {
        id: 's2',
        citation: 'Ark7 guide (June 2026)',
        title: 'New Jersey Real Estate Wholesaling Guide',
        url: 'https://ark7.com/blog/learn/cities/new-jersey-real-estate-wholesaling-guide/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide saying principals are on firmer ground assigning their equitable interest than marketing the property, and describing double closings.',
      },
      {
        id: 's3',
        citation: 'LegalZoom article',
        title: 'How to Get a Certificate of Authority in New Jersey',
        url: 'https://www.legalzoom.com/articles/how-to-get-a-certificate-of-authority-in-new-jersey',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Explains that DORES issues certificates of authority to foreign entities, which need a New Jersey registered agent.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'A4278',
        session: '2026-2027',
        status:
          'Introduced 2026-02-19 (sponsors Hutchison and Miller); later status not verified',
        url: 'https://pub.njleg.state.nj.us/Bills/2026/A4500/4278_I1.HTM',
        summary:
          'License requirement for wholesale transactions in residential property, mandatory contract disclosures, and a 30-day consumer cancellation right with refunds.',
      },
    ],
    openQuestions: [
      'Confirm the current text of N.J.S.A. 45:15-3 and 45:15-4 and whether the Real Estate Commission or courts have treated repeated assignments or property marketing by a principal as unlicensed brokerage.',
      "What is A4278's committee status, and is there a Senate companion?",
      'Do any New Jersey statutes on distressed or foreclosure property purchases (foreclosure rescue rules) apply to wholesale contracts with homeowners in default?',
      'Do any municipalities (e.g., Newark, Camden, Jersey City) regulate investor solicitation of homeowners?',
    ],
    activationSteps: [
      'Obtain a written New Jersey counsel opinion on principal assignment before launch.',
      'Register the LLC with DORES, appoint a registered agent, and complete state tax registration.',
      'Market only the contract interest and do not negotiate for sellers or end buyers.',
      'Prepare a contract and disclosure template matching A4278 so the market can switch quickly if it is enacted.',
    ],
    confidence: 'low',
  },
  {
    code: 'NM',
    name: 'New Mexico',
    researchedAt: '2026-10-22',
    summary:
      "No New Mexico wholesaling statute or Real Estate Commission guidance was found. NMSA 61-29-2 (as amended by 2021 HB 230) ties broker activity to listing, selling, buying or negotiating real estate or options for compensation or consideration from another, and to advertising a business of dealing in options for others. The owner exemption covers activity on property the person owns, so a contract purchaser's position is unclear.",
    proposedClassification: 'E',
    classificationRationale:
      "The definition's phrase 'compensation or other consideration from another' could be read to reach anyone paid by a buyer, with only an owner exemption to fall back on, or to reach only those acting for others. Without regulator guidance on assignments, the information is insufficient to classify.",
    regulator: {
      name: 'New Mexico Real Estate Commission',
      url: null,
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: 'NMSA 61-29-2 defines broker activity as listing, selling, buying or negotiating real estate or options for compensation or other consideration from another; the owner exemption covers property owned by the person. Whether a contract purchaser assigning its interest is within the definition is unresolved; no Commission guidance found.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'Advertising or representing oneself as in the business of dealing with options for others is listed broker activity; application to wholesaling unverified.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The owner exemption in 61-29-2 covers a person acting with reference to property it owns (except subdivisions of 100 or more parcels), which supports reselling after taking title; counsel to confirm.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'Foreign LLCs register with the Secretary of State before transacting business (reported as NMSA 53-19-48), with a designated registered agent; secondary source only.',
        sourceIds: ['s2'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'NMSA 1978 61-29-2 (as amended by 2021 HB 230)',
        title: 'House Bill 230 (2021), final version amending NMSA 61-29-2',
        url: 'https://www.nmlegis.gov/Sessions/21%20Regular/final/HB0230.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Amended definitions tying broker activity to listing, selling, buying or negotiating real estate or options for consideration from another, with an exemption for owners of the property.',
      },
      {
        id: 's2',
        citation: 'Harbor Compliance, New Mexico foreign LLC registration',
        title: 'New Mexico Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-new-mexico-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Reports that foreign LLCs register with the New Mexico Secretary of State under the LLC Act before transacting business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Confirm the current codified text of NMSA 61-29-2 and whether later sessions amended it.',
      'Does the New Mexico Real Estate Commission consider an unlicensed assignment of a purchase contract for a fee to be brokerage?',
      'Were any wholesaling bills introduced in 2025 or 2026 New Mexico sessions? None were found in this pass.',
      'Verify the foreign LLC registration statute and requirements with the Secretary of State.',
    ],
    activationSteps: [
      'Do not launch New Mexico until counsel resolves the licensing question.',
      'Register the foreign LLC with the New Mexico Secretary of State and appoint a registered agent.',
      'Consider a New Mexico-licensed broker partner or a take-title-then-resell model.',
    ],
    confidence: 'low',
  },
  {
    code: 'NY',
    name: 'New York',
    researchedAt: '2026-10-22',
    summary:
      'No New York statute specific to wholesaling was found. Real Property Law 440 defines a broker as someone acting for another and for a fee, so a true principal assigning its own contract is commonly treated as outside licensing, though marketing the property or negotiating for others risks unlicensed brokerage. Two overlays matter: the Home Equity Theft Prevention Act (RPL 265-a) for owner-occupied homes in default or foreclosure, which requires contract notices and gives a 14-business-day cancellation right, and RPL 442-h cease-and-desist zones that bar solicitation by anyone regularly engaged in buying and selling real estate.',
    proposedClassification: 'B',
    classificationRationale:
      'Principal assignment appears permitted without a license because the broker definition requires acting for another, but no official DOS guidance confirms this, so the lead rests on statute text and secondary sources. The usable path carries conditions: HETPA-compliant contracts (or excluding distressed homes), compliance with cease-and-desist zone non-solicitation lists, marketing only the contract interest, and the foreign-LLC publication requirement. Classification would move to C or D if counsel reads repeated assignments as brokerage.',
    regulator: {
      name: 'New York Department of State, Division of Licensing Services',
      url: 'https://dos.ny.gov/licensing-services',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'RPL 440 requires acting for another and for a fee; it does not address contract assignment. Secondary sources say a wholesaler acting purely as principal (assigning its own contract or buying and reselling) does not need a license, but representing the seller or buyer or negotiating for them would. No DOS opinion was located.',
        sourceIds: ['s1', 's5'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler-specific registration was found in the licensing statute or pending bills reviewed.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'A license is required when the activity is performed for another for a fee, including offering or attempting to negotiate. No statutory transaction-count threshold was found for principals. Repeated assignments are not expressly covered; counsel must decide whether a high-volume assignment business is treated as brokerage.',
        sourceIds: ['s1', 's5'],
      },
      disclosures_required: {
        answer: 'conditional',
        note: 'No general wholesaling disclosure was found. For covered contracts with owner-occupants of 1-4 family homes in foreclosure or default (two or more months behind), RPL 265-a requires a prominent cancellation notice and related warnings.',
        sourceIds: ['s2'],
        items: [
          {
            audience: 'seller',
            description:
              "HETPA notice of the right to cancel the sale contract without penalty before a stated date, and a warning that the purchaser's agents cannot ask the seller to sign a deed until the cancellation right ends.",
            timing:
              'In the contract, for covered residences in foreclosure or default',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'No statute addresses this directly. Secondary sources advise that an unlicensed wholesaler may market its assignable contract interest but not market the property as if representing the owner. Inside a cease-and-desist zone, soliciting listed owners is barred.',
        sourceIds: ['s5', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "No statute prohibits a principal from offering its own contract interest to known investors; the risk is being seen as negotiating for the seller. Based on the 'for another' definition and secondary sources only.",
        sourceIds: ['s1', 's5'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No general statutory restriction on assigning residential purchase contracts was found. For HETPA-covered residences, the equity purchaser may not have the seller sign a deed during the cancellation period, and the statute regulates the transaction broadly; counsel should confirm how an assignment interacts with HETPA.',
        sourceIds: ['s2'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Buying and reselling for one's own account is not acting 'for another' under RPL 440, so it appears lawful without a license, subject to HETPA where the seller's home is in default or foreclosure.",
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only under HETPA (RPL 265-a) for covered residences in foreclosure or default: the seller may cancel until midnight of the fourteenth business day after signing (official text revision dated 2023-12-15). No general wholesale cancellation right was found.',
        sourceIds: ['s2'],
        deadline: {
          days: 14,
          businessDays: true,
          trigger:
            'after the equity seller signs the contract (HETPA-covered residences only)',
        },
      },
      local_restrictions: {
        answer: 'yes',
        note: 'Under RPL 442-h the Secretary of State may designate cease-and-desist zones; owners in a zone who file a statement may not be solicited by brokers, salespersons or other persons regularly engaged in buying and selling real estate. Bill text references existing zones in Queens, Bronx and Rockland counties and sought to add Kings County; pending A5881B would add another zone. The current list of zones was not verified.',
        sourceIds: ['s3', 's4', 's9'],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC files an Application for Authority with the Department of State (LLC Law 802), then within 120 days must publish notice once a week for six weeks in two newspapers designated by the county clerk and file a Certificate of Publication ($50); non-compliance suspends authority to do business.',
        sourceIds: ['s6', 's7'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'N.Y. Real Property Law 440',
        title: 'Definitions (real estate broker)',
        url: 'https://www.nysenate.gov/legislation/laws/RPP/440',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a real estate broker as one who, for another and for a fee, lists, sells, buys, exchanges or rents real estate or offers or attempts to negotiate such transactions.',
      },
      {
        id: 's2',
        citation: 'N.Y. Real Property Law 265-a',
        title: 'Home equity theft prevention',
        url: 'https://www.nysenate.gov/legislation/laws/RPP/265-A',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Regulates purchases of owner-occupied 1-4 family residences in foreclosure or default, with a 14-business-day seller cancellation right and mandatory contract notices (revision dated 2023-12-15).',
      },
      {
        id: 's3',
        citation: 'N.Y. Real Property Law 442-h',
        title: 'Nonsolicitation orders and cease and desist zones',
        url: 'https://www.nysenate.gov/legislation/laws/RPP/442-H',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Lets the Secretary of State create cease-and-desist zones where listed owners may not be solicited by licensees or others regularly engaged in buying and selling real estate.',
      },
      {
        id: 's4',
        citation: 'N.Y. S7971 (2023-2024 session), companion A9332',
        title: 'Bill designating Kings County for the cease and desist list',
        url: 'https://legislation.nysenate.gov/pdf/bills/2023/S7971',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Bill text (seen in search results) designating Kings County under RPL 442-h and citing existing zones in Queens, Bronx and Rockland; enactment status not verified.',
      },
      {
        id: 's5',
        citation: 'Bridge Legal article',
        title: 'Do You Need a Real Estate License to Wholesale in New York',
        url: 'https://bridgelegal.org/do-you-need-real-estate-license-wholesale-york/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Secondary commentary that New York wholesalers acting as principals by assignment or double close do not need a license, but must not market or negotiate for others.',
      },
      {
        id: 's6',
        citation: 'N.Y. Department of State, Division of Corporations',
        title:
          'Application for Authority - Foreign Limited Liability Companies',
        url: 'https://dos.ny.gov/application-authority-foreign-limited-liability-companies',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'DOS instructions for a foreign LLC to obtain authority to do business in New York.',
      },
      {
        id: 's7',
        citation: 'N.Y. Department of State, Division of Corporations',
        title:
          'Certificate of Publication for Foreign Limited Liability Company',
        url: 'https://dos.ny.gov/node/17231',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Explains the LLC Law 802 publication requirement within 120 days, the $50 certificate filing, and suspension for non-compliance.',
      },
      {
        id: 's8',
        citation: 'N.Y. S5642 (2025-2026)',
        title:
          'Requires a sworn affidavit stating the seller was informed of the fair market value of the property',
        url: 'https://nysenate.gov/legislation/bills/2025/S5642',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would amend RPL 333 to require a seller affidavit that the buyer informed the seller of fair market value; in Senate Judiciary Committee as of January 2026.',
      },
      {
        id: 's9',
        citation: 'N.Y. A5881B (2025-2026)',
        title:
          'Designates the 56th assembly district as a cease and desist zone',
        url: 'https://www.nysenate.gov/legislation/bills/2025/A5881',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would add a cease-and-desist zone and an affirmative defense where the owner publicized the property for sale; in Senate Rules Committee.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'S5642',
        session: '2025-2026',
        status: 'In Senate Judiciary Committee (as of January 2026)',
        url: 'https://nysenate.gov/legislation/bills/2025/S5642',
        summary:
          "Seller must give a sworn affidavit, with transfer forms, that the buyer informed them of the property's fair market value; aimed at speculators approaching heirs.",
      },
      {
        bill: 'A5881B',
        session: '2025-2026',
        status: 'Shown in Senate Rules Committee on nysenate.gov; not enacted',
        url: 'https://www.nysenate.gov/legislation/bills/2025/A5881',
        summary:
          'Adds a cease-and-desist zone (Assembly District 56, community boards 3 and 8) and an affirmative defense for owners who advertised their property.',
      },
    ],
    openQuestions: [
      'Has the Department of State or any New York court treated a business of repeatedly assigning purchase contracts for a fee, or marketing the property while under contract, as unlicensed brokerage?',
      'Which cease-and-desist zones are currently in force (19 NYCRR 175.17 list), was the Kings County designation enacted, and does outreach by mail, phone or text to listed owners violate RPL 442-h?',
      'Confirm the HETPA cancellation period (14 business days per the official page) and how HETPA applies when an equity purchaser assigns the contract to an end buyer.',
      'Is there any New York City local law on investor solicitation or deed theft that adds requirements beyond state law?',
    ],
    activationSteps: [
      'File an Application for Authority for the LLC and complete the 120-day newspaper publication and Certificate of Publication.',
      'Screen every NY lead for foreclosure/default status; either use HETPA-compliant contracts with the 14-business-day cancellation notice or exclude covered properties.',
      'Check the Department of State cease-and-desist lists before any outreach in designated zones.',
      "Market only the company's contract interest, never represent or negotiate for the seller or the end buyer, and obtain a written counsel opinion on high-volume assignment.",
      'Monitor S5642 and A5881B.',
    ],
    confidence: 'medium',
  },
  {
    code: 'NC',
    name: 'North Carolina',
    researchedAt: '2026-10-22',
    summary:
      "North Carolina has no wholesaling statute yet. The Real Estate Commission's December 2023 bulletin says a bona fide buyer may assign its purchase contract without a license, but lists conduct it treats as possible unlicensed brokerage: soliciting sellers with cash-purchase claims while intending only to find buyers, misrepresenting ownership, handling deposits for others, negotiating between seller and buyer, and marketing to buyers generally rather than a specific assigned contract. H 797 (2025), which would make residential wholesaling licensed brokerage and give homeowners a non-waivable 30-day cancellation right, passed the House on 2025-04-30 and has been in Senate Rules since 2025-05-01.",
    proposedClassification: 'D',
    classificationRationale:
      "Assignment by a genuine principal buyer is currently permitted without a license, but the Commission restricts specific marketing and transaction practices (generalized buyer marketing, seller solicitation without intent to buy, handling others' deposits). A model built on a genuine purchase intent and marketing of specific contracts may work, which is the D pattern. If H 797 or a similar bill is enacted, the market would move to C (license required) with a 30-day homeowner cancellation right.",
    regulator: {
      name: 'North Carolina Real Estate Commission',
      url: 'https://www.ncrec.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'NCREC: no license is needed for a bona fide buyer to assign its rights and interests in a purchase contract to a third party. The protection depends on being a genuine buyer; soliciting sellers to buy for cash with no intention of purchasing is flagged as possible unlicensed brokerage.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration exists. Pending H 797 would require a broker license rather than a registration.',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Not required for a bona fide buyer assigning a specific contract. NCREC lists conduct that may require a license regardless of frequency: misrepresenting ownership, collecting or delivering due diligence fees or earnest money for others, negotiating contracts between seller and buyer, acting for an investor entity without being an officer or W-2 employee, and soliciting buyers generally. G.S. 93A-2(a) reaches negotiating sales for others for compensation; unlicensed practice under 93A-1 is a Class 1 misdemeanor. No transaction-count threshold.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'no',
        note: "No enacted wholesaling disclosure was found. NCREC warns that misrepresenting one's ownership interest may be brokerage. Pending H 797 would require a cancellation-rights notice in at least 14-point type above the homeowner's signature.",
        sourceIds: ['s1', 's2', 's3'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'NCREC treats marketing to buyers generally, unconnected to a specific assigned contract, as possible unlicensed brokerage, and also flags misrepresenting ownership. Marketing a specific contract Hālo holds as a bona fide buyer appears tolerated; NCREC has not defined permissible advertising content.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Outreach to known investors about a specific contract Hālo holds appears consistent with the NCREC guidance; standing buyer-list solicitation unconnected to a specific contract is flagged as possible brokerage.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No enacted statutory restriction was found. Pending H 797 would make marketing, assigning, or selling purchase contracts or equitable interests in residential property for compensation a brokerage activity.',
        sourceIds: ['s2', 's3'],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: "Not addressed in the NCREC bulletin or the sources reviewed. H 797's definition would also reach dealing in purchase contracts, equitable interests, or options. The owner exemption in Chapter 93A was not reviewed.",
        sourceIds: ['s3'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'None enacted as of 2026-10-22. H 797 would give homeowners a non-waivable right to cancel until midnight of the 30th day after signing or until conveyance, whichever is first, with refunds within 10 business days; it remains in Senate Rules.',
        sourceIds: ['s2', 's3', 's4'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found; local rules were not specifically researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain a certificate of authority from the NC Secretary of State (Form L-09, $250), attach a certificate of existence no more than six months old, and keep a North Carolina registered agent and office.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'NCREC Bulletin (December 2023), Elder and Thoren',
        title:
          'Brokers & Consumers Should Beware of Unlicensed Activity in North Carolina',
        url: 'https://bulletins.ncrec.gov/brokers-consumers-should-beware-of-unlicensed-activity-in-north-carolina/',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Commission staff say a bona fide buyer may assign a purchase contract without a license and list wholesaler conduct that may be unlicensed brokerage under G.S. 93A.',
      },
      {
        id: 's2',
        citation: 'H 797 (2025-2026 Session) bill history',
        title: 'House Bill 797, Residential Property Wholesaling Protection',
        url: 'https://www.ncleg.gov/BillLookUp/2025/H797',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Passed the House 2025-04-30 and referred to Senate Rules 2025-05-01; not ratified.',
      },
      {
        id: 's3',
        citation: 'H 797, Second Edition (engrossed 2025-04-30)',
        title: 'H 797 v2 text',
        url: 'https://www.ncleg.gov/Sessions/2025/Bills/House/HTML/H797v2.html',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Would add residential property wholesaling to the broker definition and create a homeowner 30-day cancellation right with 14-point notice and 10-business-day refunds, effective for contracts from 2025-10-01 if enacted.',
      },
      {
        id: 's4',
        citation: 'UNC School of Government, Legislative Reporting Service',
        title: 'Bill Summary for H 797 (2025-2026)',
        url: 'https://lrs.sog.unc.edu/billsum/H-797-2025-2026',
        type: 'secondary',
        effectiveDate: null,
        summary:
          "Summarizes H 797's licensing, cancellation, refund, and Chapter 75 enforcement provisions.",
      },
      {
        id: 's5',
        citation: 'NC Secretary of State',
        title: 'Register a Foreign Business: Requirements',
        url: 'https://sosnc.gov/manual/register_a_foreign_business/requirements',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLCs need a certificate of authority (Form L-09, $250), a certificate of existence no more than six months old, and an NC registered agent and office.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'H 797',
        session: '2025-2026',
        status:
          'Passed House 2025-04-30 (2nd reading 103-0); referred to Senate Committee on Rules and Operations 2025-05-01; no later action shown.',
        url: 'https://www.ncleg.gov/BillLookUp/2025/H797',
        summary:
          'Would make residential property wholesaling licensed brokerage and create the Residential Property Wholesaling and We Buy Houses Homeowner Protection Act, with a non-waivable 30-day homeowner cancellation right, 10-business-day refunds, and Chapter 75 enforcement.',
      },
    ],
    openQuestions: [
      'Is H 797 still eligible for Senate action, and is a similar bill expected in the 2027 long session?',
      "Would Hālo's standing investor buyer list and deal alerts count as 'soliciting and marketing of buyers generally' under the NCREC guidance?",
      'How does North Carolina treat double closings by an entity whose business is buying and reselling, given the 93A owner exemption?',
      'May Hālo, rather than a closing attorney, hold investor earnest money or due diligence fees without being treated as handling funds for others?',
      'If H 797 passes, does its license requirement reach a principal that assigns its own contract, and would the 30-day cancellation apply to contracts Hālo plans to close itself?',
    ],
    activationSteps: [
      'Contract only where Hālo intends to and can close itself (bona fide buyer), and avoid seller marketing that promises a cash purchase Hālo does not intend to make.',
      'Market each North Carolina contract specifically to buyers; do not run generalized buyer solicitation detached from a specific contract Hālo holds.',
      "Have earnest money and due diligence fees paid to the closing attorney or escrow agent, never to Hālo on others' behalf, and do not negotiate terms between the seller and the end buyer.",
      'Monitor H 797 and prepare a fallback (licensed NC broker participation or principal purchase and resale) plus 30-day cancellation contract language in case it is enacted.',
      'Obtain a certificate of authority (Form L-09) from the NC Secretary of State and appoint an NC registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'ND',
    name: 'North Dakota',
    researchedAt: '2026-10-22',
    summary:
      'North Dakota treats publicly marketing an equitable interest in a purchase contract as broker activity and bars the owner exemption from covering it (HB 1190, 2023). NDCC 43-23-24 requires a wholesaler to disclose in writing to all parties that it holds only an equitable interest, may not be able to convey title, and intends to profit. HB 1125 (2025) extended this from residential to all real property and gave buyers as well as sellers a cancellation right for violations.',
    proposedClassification: 'D',
    classificationRationale:
      "Public marketing of the contract interest requires a license, while a principal's private assignment appears permitted subject to the written disclosure and the seller and buyer cancellation remedies. A licensed broker for marketing, or a purchase-and-resale structure, may work for broader distribution.",
    regulator: {
      name: 'North Dakota Real Estate Commission',
      url: 'https://www.realestatend.org/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Yes if not publicly marketed and the 43-23-24 disclosure is given. The general broker definition applies to acting for another, but publicly marketing an equitable interest is listed broker activity not covered by the owner exemption.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration; disclosure plus licensing of public marketing.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "Required for publicly marketing an equitable interest for sale, and the definition reaches a single act or transaction. The definition's opening words still refer to acting for another, so counsel should confirm, though HB 1190 was aimed at wholesalers and 43-23-07(2) bars the owner exemption for it. Private assignment is not expressly covered.",
        sourceIds: ['s1', 's2'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to all real property since HB 1125 (2025); previously residential only.',
        sourceIds: ['s1', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Written disclosure that the wholesaler holds an equitable interest, may not be able to convey title, and intends to profit from transferring the equitable interest.',
            timing:
              'Not specified by statute; give before or at signing of the agreement',
          },
          {
            audience: 'buyer',
            description:
              'Same written disclosure to the buyer and any other party to the agreement.',
            timing:
              'Not specified by statute; give before or at signing of the agreement',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'Publicly marketing for sale an equitable interest in a purchase contract is broker activity, and the owner exemption does not cover it.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Not expressly restricted: the statutory restriction is on public marketing, and other broker acts require acting for another. The written disclosure still applies.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No consent requirement, but disclosure to all parties is required and public marketing of the interest is licensed.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Bona fide owners acting on their own property are exempt in the regular course of investment; marketing before taking title is public marketing of an equitable interest.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'If the wholesaler violates 43-23-24, the seller may cancel at any time before close of escrow without penalty and keep earnest money; the buyer may also cancel and recover its earnest money.',
        sourceIds: ['s1', 's3'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'An out-of-state LLC must obtain a certificate of authority from the Secretary of State and maintain a registered agent under NDCC ch. 10-01.1.',
        sourceIds: ['s5', 's6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'NDCC 43-23-06.1(9), 43-23-07, 43-23-24',
        title: 'Real estate brokers and salespersons (chapter 43-23)',
        url: 'https://ndlegis.gov/cencode/t43c23.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines broker to include publicly marketing an equitable interest, denies the owner exemption for it, and requires wholesaler disclosure to all parties with seller and buyer cancellation rights.',
      },
      {
        id: 's2',
        citation: 'HB 1190 (2023), enrolled',
        title: 'House Bill 1190, 68th Legislative Assembly',
        url: 'https://ndlegis.gov/api/assembly/68-2023/regular/documents/23-0627-03000.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Added the equitable-interest public marketing clause, the owner-exemption carve-out, and the original residential wholesaler disclosure section.',
      },
      {
        id: 's3',
        citation: 'HB 1125 (2025)',
        title: 'HB 1125 - Overview',
        url: 'https://ndlegis.gov/assembly/69-2025/regular/bill-overview/bo1125.html',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Amended 43-23-24 among other licensing sections; signed by the Governor 2025-04-08.',
      },
      {
        id: 's4',
        citation: 'OnlineEd blog (July 12, 2026)',
        title: 'Wholesaling in North Dakota',
        url: 'https://blog.onlineed.com/2026/07/12/wholesaling-in-north-dakota/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Education-provider summary stating the 2025 expansion to all real property took effect 2025-08-01.',
      },
      {
        id: 's5',
        citation: 'North Dakota Secretary of State',
        title: 'Limited Liability Company (LLC)',
        url: 'https://www.sos.nd.gov/business/business-services/business-structures/limited-liability-company-llc',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'States an out-of-state LLC needs a certificate of authority to transact business or obtain licenses in North Dakota.',
      },
      {
        id: 's6',
        citation: 'NDCC ch. 10-32.1',
        title: 'Uniform Limited Liability Company Act',
        url: 'https://ndlegis.gov/cencode/t10c32-1.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'LLC statute requiring registered agents under chapter 10-01.1 for domestic and foreign LLCs.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "What counts as 'publicly' marketing (gated investor platform, email list, social post)?",
      "Does the 'for another' wording at the start of the 43-23-06.1(9) broker definition limit item (i), or does 43-23-07(2) make public marketing by a principal a licensed act regardless?",
      'When must the 43-23-24 disclosure be delivered? The statute names no timing.',
      "Effective date of HB 1125's changes: a secondary source says 2025-08-01; confirm from the session law.",
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Add the 43-23-24 written disclosure (equitable interest only, may not convey title, intends to profit) to North Dakota seller and buyer documents, delivered no later than signing.',
      'Disable public listing of North Dakota contract interests unless a North Dakota-licensed broker markets them.',
      'Obtain a certificate of authority and a registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'OH',
    name: 'Ohio',
    researchedAt: '2026-10-22',
    summary:
      'Ohio enacted SB 155 (R.C. 5301.95), effective 2026-03-02: a wholesaler buying 1-4 unit residential property must give the owner a separate, boldface, signed statutory disclosure before any binding contract, or the owner may cancel before closing and recover earnest money. The law does not create a license or registration, but the Legislative Service Commission notes that unlicensed wholesalers still may not perform licensed acts such as marketing a property to the general public. A 2023-2024 bill that would have required a broker license for dealing in residential contracts was not enacted.',
    proposedClassification: 'B',
    classificationRationale:
      "The statute expressly contemplates wholesalers assigning or novating residential contracts for a fee and conditions the practice on a prescribed pre-contract disclosure, with cancellation and consumer-protection remedies for failure. Licensing remains relevant only where the wholesaler performs brokerage acts; the LSC analysis flags public marketing of the property as one of them, which the platform's marketing design must respect.",
    regulator: {
      name: 'Ohio Department of Commerce, Division of Real Estate and Professional Licensing',
      url: 'https://com.ohio.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Permitted with the R.C. 5301.95 disclosure; the statute defines a wholesaler as one who, for a fee, contracts to buy 1-4 unit residential property and assigns or novates the contract. Licensed acts (per LSC, e.g., marketing a property to the general public) still need a license.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'SB 155 imposes disclosures only; no registration. The earlier SB 192 licensing proposal was not enacted (LSC described current law as not addressing wholesaling in June 2025).',
        sourceIds: ['s2', 's4'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "No license is required merely to assign one's own contract, but R.C. 4735.01 covers acting for another for a fee, dealing in options, and holding oneself out as in the business of selling real estate; LSC says marketing a property to the general public requires a license. No frequency threshold found.",
        sourceIds: ['s2', 's3'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to wholesalers acting as grantee for 1-4 unit residential property. Exclusions: assignments to blood relatives, or to a parent, affiliate or subsidiary under common control. Waivers are void.',
        sourceIds: ['s1', 's2'],
        items: [
          {
            audience: 'seller',
            description:
              "Separate written disclosure statement, boldface, at least 12-point, in substantially the statutory form: the buyer is a wholesaler acting on its own behalf, may assign its interest to a third party without the owner's consent before closing, may charge the third party a separate fee, the price may be below market value, and the owner may seek legal advice. Signed and dated by owner and wholesaler.",
            timing:
              'Before entering into any binding contract conveying an interest in the property',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: 'Per the LSC analysis of SB 155, marketing a property to the general public is licensed activity that unlicensed wholesalers may not perform. Whether advertising only the contract interest is treated the same was not found. This rests on bill analysis, not statutory text.',
        sourceIds: ['s2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by SB 155 or its analysis; depends on R.C. 4735.01, which is framed around acting for another.',
        sourceIds: ['s3'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No owner consent is required (the statutory form tells the owner the wholesaler may assign without consent), but the disclosure is a precondition to a binding contract.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "R.C. 4735.01 exempts owners acting on property they own or acquired on their own account. SB 155 targets assignments and novations, so a purchase that actually closes into the buyer's name before resale appears outside it; counsel should confirm, including for a grantor who resells without holding title.",
        sourceIds: ['s1', 's3'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: "Only where the wholesaler failed to give the disclosure: the owner may cancel at any time before close of escrow without penalty, and the escrow or closing agent must pay the wholesaler's earnest money to the owner within 30 days. No fixed day count applies otherwise.",
        sourceIds: ['s1', 's2'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC registers with the Secretary of State (historically Form 533B; the SOS forms page should be checked for the current form) and appoints an Ohio statutory agent.',
        sourceIds: ['s6', 's7'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'R.C. 5301.95',
        title: 'Wholesaler disclosure for residential real property',
        url: 'https://codes.ohio.gov/ohio-revised-code/section-5301.95',
        type: 'statute',
        effectiveDate: '2026-03-02',
        summary:
          'Defines wholesaler, requires a separate boldface signed disclosure to the owner before a binding contract, allows cancellation before closing for non-compliance, and makes violations a consumer sales practices violation.',
      },
      {
        id: 's2',
        citation: 'LSC Final Analysis, S.B. 155 (136th GA)',
        title: 'S.B. 155 Final Analysis',
        url: 'https://www.legislature.ohio.gov/download?key=26902',
        type: 'bill',
        effectiveDate: '2026-03-02',
        summary:
          'Summarizes the enacted wholesaler disclosure law, its remedies and licensee discipline, and states that unlicensed wholesalers may not perform licensed acts such as marketing a property to the general public.',
      },
      {
        id: 's3',
        citation: 'R.C. 4735.01',
        title: 'Real estate broker definitions and exemptions',
        url: 'https://codes.ohio.gov/ohio-revised-code/section-4735.01',
        type: 'statute',
        effectiveDate: '2025-09-30',
        summary:
          'Defines real estate broker around acting for another for a fee, including dealing in options and holding out as in the business, and exempts owners acting on their own property or property acquired on their own account.',
      },
      {
        id: 's4',
        citation: 'LSC Bill Analysis, S.B. 155 As Passed by the Senate',
        title: 'S.B. 155 Bill Analysis (June 2025)',
        url: 'https://www.legislature.ohio.gov/download?key=25527',
        type: 'bill',
        effectiveDate: null,
        summary:
          'States that Ohio law did not then explicitly address wholesaling, confirming no earlier wholesaling statute had been enacted.',
      },
      {
        id: 's5',
        citation: 'S.B. 192 (135th GA)',
        title: 'Senate Bill 192 - wholesaling licensing proposal',
        url: 'https://legislature.ohio.gov/legislation/135/SB192',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Proposed requiring a broker license for dealing in residential real estate contracts plus wholesaler disclosures; not enacted.',
      },
      {
        id: 's6',
        citation: 'Ohio Secretary of State',
        title: 'Business Filing Forms & Fee Schedule',
        url: 'https://www.ohiosos.gov/business/business-filing-forms',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Lists current business filing forms, including foreign LLC registration.',
      },
      {
        id: 's7',
        citation: 'Ohio SOS Form 533B',
        title: 'Registration of a Foreign Limited Liability Company',
        url: 'https://www.ohiosos.gov/globalassets/business/forms/533b.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLC registration form requiring appointment of an Ohio statutory agent; may have been superseded by a newer form.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'SB 192',
        session: '135th General Assembly (2023-2024)',
        status:
          'Not enacted; a disclosure-only successor (SB 155, 136th GA) was enacted instead',
        url: 'https://legislature.ohio.gov/legislation/135/SB192',
        summary:
          'Would have required a broker license for dealing in residential real estate contracts, whether or not on behalf of another, plus wholesaler disclosures. Watch for reintroduction.',
      },
    ],
    openQuestions: [
      'Does advertising only the contract interest (not the property) to the public count as licensed activity in Ohio, given the LSC statement about marketing a property?',
      'Is direct outreach to a closed list of investors permitted without a license under R.C. 4735.01?',
      'Does SB 155 apply when Halo or its user novates rather than assigns, and when the user double-closes as grantor without holding title?',
      'Which exact foreign LLC registration form is current at the Ohio Secretary of State?',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Generate the R.C. 5301.95 disclosure as a separate boldface 12-point document, signed and dated by owner and wholesaler, and block contract execution until it is complete.',
      'Remove any waiver or modification of the disclosure remedies from Ohio contract templates.',
      'Restrict public listing of Ohio properties to a licensed Ohio brokerage, or confine marketing to the contract interest after counsel sign-off.',
      'Register as a foreign LLC and appoint an Ohio statutory agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'OK',
    name: 'Oklahoma',
    researchedAt: '2026-10-22',
    summary:
      "Since November 1, 2021, 59 O.S. 858-301 has treated publicly marketing an equitable interest in an owner-buyer purchase contract as acting as a real estate licensee, so unlicensed public marketing is prohibited. Since November 1, 2025 (SB 1075, 59 O.S. 858-102 and 858-314), wholesalers, defined to include assignors and double-closers of residential real estate, must give homeowners specific written disclosures and a mandatory notice. Homeowners may cancel within two business days, and contracts lacking the disclosures are invalid. A 2024 Attorney General opinion says whether private-group or opt-in email marketing is 'public' depends on group size and pre-existing relationships.",
    proposedClassification: 'D',
    classificationRationale:
      'Public marketing of contract interests by unlicensed persons is expressly prohibited, while purchase for own account and owner sales remain exempt. On top of that, SB 1075 adds mandatory homeowner disclosures, contract terms, a two-business-day cancellation right and escrow of earnest money, and these apply to wholesalers and double-closers whether or not they are licensed. A model built on licensed brokerage participation for marketing, or genuinely private outreach to pre-existing relationships, plus full SB 1075 compliance may work.',
    regulator: {
      name: 'Oklahoma Real Estate Commission',
      url: 'https://oklahoma.gov/orec.html',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'No license is needed so long as the contract interest is not publicly marketed. 858-301 treats public marketing of an equitable interest as licensed activity, and the AG says marketing within a small group of close friends needs no license. SB 1075 disclosures, contract terms and the cancellation right apply regardless of license.',
        sourceIds: ['s1', 's2', 's3', 's4'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: "SB 1075 defines 'wholesaler' and imposes duties, but no registration was found.",
        sourceIds: ['s3'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: "A license is required to publicly market an equitable interest, with no transaction-count threshold. Whether private marketing is 'public' is fact-specific per AG Opinion 2024-20. 'Publicly market' is defined in 858-102 as advertising or marketing done in a public or open manner or place.",
        sourceIds: ['s1', 's3', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: '59 O.S. 858-314 (SB 1075), effective November 1, 2025. Missing disclosures make the contract invalid and unenforceable by the wholesaler, and the homeowner gets the earnest money. OREC publishes the required cancellation form.',
        sourceIds: ['s3', 's5'],
        items: [
          {
            audience: 'seller',
            description:
              "Written disclosure of the wholesaler's intent to assign or sell its equitable interest for a higher price than offered to the homeowner.",
            timing: 'Before execution of any contract or written agreement',
          },
          {
            audience: 'seller',
            description:
              'Prominent written statement in all contracts that the homeowner should seek legal advice before signing.',
            timing: 'In every written contract between the parties',
          },
          {
            audience: 'seller',
            description:
              "Written disclosure of the homeowner's right to cancel without penalty within two business days after execution.",
            timing: 'At contract execution',
          },
          {
            audience: 'seller',
            description:
              "The contract must state the wholesaler's name, address and phone, the property address, total consideration and payment terms (including promised services). It must also carry the statutory 'NOTICE REQUIRED BY OKLAHOMA LAW' cancellation notice next to the seller signature line, in 12-point bold or capitals.",
            timing: 'In the contract',
          },
          {
            audience: 'seller',
            description:
              "Include OREC's notice of cancellation form with the contract, at no cost to the homeowner.",
            timing: 'With the contract',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: "Unlicensed persons may not publicly market for sale an equitable interest in an owner-buyer purchase contract. The owner exemption preserves acquiring real estate for one's own use and an owner selling real estate it owns.",
        sourceIds: ['s1', 's2', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'AG Opinion 2024-20 says this is fact-intensive. Marketing to a small group of close friends does not require a license. A private group or opt-in list with many thousands of members whose only link is the list likely is public marketing. Size and pre-existing relationships are the key factors.',
        sourceIds: ['s4'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: "Assignment is not prohibited, but SB 1075 requires disclosing the intent to assign before contracting and bars wholesalers from placing liens or otherwise clouding title. Wholesalers may not act as the homeowner's advisor or claim licenses they lack, and earnest money must be held in an Oklahoma escrow account at a federally insured institution.",
        sourceIds: ['s3'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "SB 1075's 'wholesaler' definition expressly includes double closings, meaning simultaneous closings with the seller and end buyer without intent to reside in or materially improve the property. So all the disclosure, cancellation and escrow duties apply. Reselling after acquiring title falls under the owner exemption in 858-301, but publicly marketing before closing is marketing an equitable interest.",
        sourceIds: ['s3', 's1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: "The homeowner may cancel without penalty within two business days of contract execution. The homeowner may also terminate at any time if the wholesaler fails to comply, and a contract lacking the disclosures is invalid. 'Business day' excludes weekends and public holidays.",
        sourceIds: ['s3', 's5'],
        deadline: {
          days: 2,
          businessDays: true,
          trigger: 'after the contract is executed',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: "The Secretary of State lists a 'Registration of Foreign Limited Liability Company' filing ($300) and a $25 Annual Certificate for foreign LLCs, plus resident agent filings. Tax registration was not researched.",
        sourceIds: ['s6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: '59 O.S. 858-301, as amended by HB 1148 (2021)',
        title:
          'HB 1148 Senate floor version (Predatory Real Estate Wholesaler Prohibition Act)',
        url: 'https://www.oklegislature.gov/cf_pdf/2021-22 FLR/SFLR/HB1148 SFLR.PDF',
        type: 'bill',
        effectiveDate: '2021-11-01',
        summary:
          'Treats publicly marketing an equitable interest in an owner-buyer contract as acting as a licensee, while preserving exemptions for owners and own-use acquisition.',
      },
      {
        id: 's2',
        citation: 'OREC, Predatory Real Estate Wholesaler Prohibition Act',
        title: 'Wholesale Act (OREC blog)',
        url: 'https://oklahoma.gov/orec/resources/blog/wholesale-act.html',
        type: 'regulator_guidance',
        effectiveDate: '2021-11-01',
        summary:
          'OREC explains the act took effect November 1, 2021 and requires wholesalers to be licensed.',
      },
      {
        id: 's3',
        citation: 'SB 1075 (2025), enrolled; 59 O.S. 858-102 and 858-314',
        title: 'Enrolled SB 1075: real estate wholesale practices',
        url: 'https://oklegislature.gov/cf_pdf/2025-26 ENR/SB/SB1075 ENR.PDF',
        type: 'bill',
        effectiveDate: '2025-11-01',
        summary:
          'Defines wholesaler (including double closing) and imposes homeowner disclosures, contract contents, a two-business-day cancellation right, an escrow requirement and a ban on clouding title.',
      },
      {
        id: 's4',
        citation: '2024 OK AG 20 (Dec. 31, 2024)',
        title: 'Attorney General Opinion 2024-20 to OREC',
        url: 'https://oklahoma.gov/content/dam/ok/en/oag/opinions/ag-opinions/2024/AG%20Opinion%202024-20%202024%20OK%20AG%2020.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "Whether private-group or opt-in email marketing of an equitable interest is 'public marketing' turns on group size and pre-existing relationships.",
      },
      {
        id: 's5',
        citation: 'OREC form: Cancellation of Wholesale Contract (01-01-2026)',
        title:
          "Notice of Homeowner's Cancellation of Wholesale Real Estate Purchase Contract",
        url: 'https://oklahoma.gov/content/dam/ok/en/orec/documents/resources/Broker%20Wholesaling%20Resource%20guide.pdf',
        type: 'regulator_guidance',
        effectiveDate: '2026-01-01',
        summary:
          'OREC-approved form citing 858-314(C) and (F) that restates the required disclosures and cancellation rights.',
      },
      {
        id: 's6',
        citation: 'Oklahoma Secretary of State, Business Forms and Fees',
        title: 'Forms and Fees - Business',
        url: 'https://www.sos.ok.gov/business/forms.aspx',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Lists Registration of Foreign Limited Liability Company ($300) and Annual Certificate ($25) filings.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Confirm the final enrolled text of HB 1148 (2021) and the current 858-301 wording; the version reviewed was the Senate floor version.',
      "Would a gated investor marketplace with vetted members be 'public marketing' under the AG opinion's size and relationship factors?",
      "Do the SB 1075 duties apply to licensed wholesalers as well as unlicensed ones? The text applies to any 'wholesaler'.",
      'Has OREC promulgated rules under 858-314(H)?',
      "Is a double closing where the wholesaler funds its own purchase still within the 'wholesaler' definition?",
    ],
    activationSteps: [
      'Adopt an Oklahoma seller contract with all 858-314 terms: pre-contract intent disclosure, legal-advice statement, the bold cancellation notice next to the signature, and the attached OREC cancellation form.',
      'Hold Oklahoma earnest money in an in-state escrow account at a federally insured institution.',
      'Enforce a two-business-day cooling-off period before any assignment or marketing step, and never record memoranda or liens against seller property.',
      'Route public marketing of Oklahoma contract interests through an Oklahoma-licensed broker; limit unlicensed outreach to pre-existing relationships cleared by counsel.',
      'File the Registration of Foreign LLC with the Oklahoma Secretary of State and appoint a resident agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'OR',
    name: 'Oregon',
    researchedAt: '2026-10-22',
    summary:
      'HB 4058 (Oregon Laws 2024, ch. 3) requires anyone marketing residential property in which they hold only an equitable interest or option (held under 90 days, under $10,000 invested) to register with the Oregon Real Estate Agency as a residential property wholesaler, unless licensed. It applies to contracts entered on or after July 1, 2025. Registered wholesalers must give a prescribed written disclosure to sellers and buyers before contracting and in all advertising, and either party may cancel within three business days after receiving it.',
    proposedClassification: 'C',
    classificationRationale:
      "Oregon requires a wholesaler-specific registration (individual registrants, $300 fee, background check) for the intended activity, with one act sufficient. Disclosure, advertising and cancellation conditions also apply (B-type conditions), but the registration requirement makes C the operative class. The sources are the enacted session law and the regulator's own pages, so confidence is high.",
    regulator: {
      name: 'Oregon Real Estate Agency',
      url: 'https://www.oregon.gov/rea',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Permitted without a real estate license only if the individual conducting the wholesaling (for an entity, the individual acting on its behalf) is registered as a residential property wholesaler and gives the required disclosures. Not 'wholesaling' if, when marketing, the interest has been held 90 days or more or $10,000 or more has been invested in development or improvements. Applies to contracts entered on or after 2025-07-01.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'yes',
        note: 'Registration with OREA is required before engaging in residential property wholesaling; one act suffices. Registration is issued only to individuals, requires a criminal records check, lists all entity and assumed business names (entities must be authorized by the Secretary of State), costs up to $300, and renews annually by June 30. Licensees are exempt from registration if they give the disclosure.',
        sourceIds: ['s1', 's3', 's4'],
      },
      license_required_for_activity: {
        answer: 'no',
        note: "A real estate license is not required for wholesaling of the company's own equitable interest if the individual is registered as a wholesaler; registration substitutes for licensure. A license is still required for professional real estate activity performed for another (ORS 696.010 as amended).",
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'yes',
        note: "Statutory Residential Property Wholesaler Written Disclosure in at least 10-point bold type, using OREA's form, stating wholesaler status, equitable interest only, no legal title, possibly not a licensed broker or appraiser; OREA's form also describes the cancellation right and remedies.",
        sourceIds: ['s1', 's2', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Residential Property Wholesaler Written Disclosure (OREA form) stating wholesaler status, equitable interest only, no legal title, possibly unlicensed and not an appraiser.',
            timing: 'Before entering into the written purchase contract',
          },
          {
            audience: 'buyer',
            description:
              'Same written disclosure to any potential buyer, and to any Oregon licensee assisting a potential buyer or assisting the wholesaler in marketing or listing the property.',
            timing:
              'Before entering into the written contract with the buyer (and before the licensee assists)',
          },
          {
            audience: 'buyer',
            description:
              'Disclosure in all advertising for the property; per OREA, social media ads are exempt if they link to a separate page containing the required information.',
            timing: 'In every advertisement',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: "Yes for registered wholesalers (or licensees), provided every advertisement carries the required disclosure. 'Market' covers advertising and soliciting purchasers publicly or privately.",
        sourceIds: ['s1', 's3'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Private solicitation of purchasers is also 'marketing', so outreach to known investors requires registration and the written disclosure before contracting.",
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No consent requirement or outright prohibition on assignment was found; assignment-based wholesaling is subject to registration, pre-contract disclosure, the three-business-day cancellation right, and seller termination if the disclosure was not given.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'If the company takes title before marketing, it no longer holds only an equitable interest and the wholesaling definition is not met; but marketing during the contract period (before closing) is wholesaling and requires registration and disclosures.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: 'Seller (and buyer) may cancel a residential property wholesale contract without penalty by written notice before midnight at the end of the third business day after receiving the wholesaler disclosure; non-waivable; deposits returned. If the disclosure was not given to the seller before contracting, the seller may terminate at any time and keep earnest money, and the wholesaler is liable for damages and attorney fees.',
        sourceIds: ['s1'],
        deadline: {
          days: 3,
          businessDays: true,
          trigger:
            'after the seller receives the residential property wholesaler written disclosure',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain authority from the Secretary of State before transacting business (ORS 63.701). HB 4058 also requires the registrant to show that all entities, including foreign entities, are authorized by the Secretary of State.',
        sourceIds: ['s5', 's1'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Or. Laws 2024, ch. 3 (HB 4058), secs. 1-14',
        title: 'Oregon Laws 2024, Chapter 3 - Residential property wholesaling',
        url: 'https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0003.pdf',
        type: 'statute',
        effectiveDate: '2025-07-01',
        summary:
          'Creates residential property wholesaler registration, mandatory disclosures, a three-business-day cancellation right, penalties, and seller remedies; operative and applicable to contracts from July 1, 2025 (Act effective January 1, 2025).',
      },
      {
        id: 's2',
        citation: 'Oregon Real Estate Agency, Residential Property Wholesaling',
        title: 'Residential Property Wholesaling',
        url: 'https://www.oregon.gov/rea/Pages/Residential-Property-Wholesaling.aspx',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Agency page explaining who must register or be licensed, the official disclosure forms, and seller cancellation remedies.',
      },
      {
        id: 's3',
        citation:
          'Oregon Real Estate Agency, Property Wholesaling Law Rule Overview (OAR ch. 863, div. 17)',
        title: 'Property Wholesaling Law Rule Overview',
        url: 'https://www.oregon.gov/rea/newsroom/Pages/2024-OREN-J/Property-Wholesaling-Law-Rule-Overview.aspx',
        type: 'regulator_guidance',
        effectiveDate: '2025-07-01',
        summary:
          'Summarizes rules effective July 1, 2025: online registration, background check, $300 fee and June 30 renewal, disclosure content, and the social-media advertising exception.',
      },
      {
        id: 's4',
        citation: 'OAR chapter 863 (HB 4058 property wholesaler rules)',
        title: 'OAR 863 rules - HB 4058 Property Wholesaler',
        url: 'https://oregon.gov/rea/Documents/OAR-863-rules-HB%204058-Property-Wholesaler.pdf',
        type: 'regulation',
        effectiveDate: '2025-07-01',
        summary:
          'Agency rules implementing wholesaler registration and disclosures, filed December 12, 2024 and effective July 1, 2025.',
      },
      {
        id: 's5',
        citation: 'ORS 63.701',
        title: 'ORS 63.701 - Authority to transact business required',
        url: 'https://oregon.public.law/statutes/ors_63.701',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Bars a foreign LLC from transacting business in Oregon until authorized by the Secretary of State; lists activities that are not transacting business.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Were sections 1-9 of Oregon Laws 2024 ch. 3 amended in the 2025 or 2026 sessions, and under which ORS numbers are they now codified?',
      'What exact form and wording does OAR 863 division 17 require, and are there recordkeeping or contract-language rules beyond the disclosure?',
      "Does 'residential property' (land zoned residential) sweep in vacant residential lots and multi-unit buildings the business intends to buy?",
      'Which individuals inside the company must register (every person who markets, or one responsible individual)?',
    ],
    activationSteps: [
      'Register each individual who conducts wholesaling for the company with OREA (online application, background check, $300 fee, renewal by June 30) and list the LLC and any assumed names.',
      'Obtain authority for the foreign LLC from the Oregon Secretary of State before registering.',
      "Deliver OREA's Residential Property Wholesaler Written Disclosure to every seller and buyer before contracting and to assisting licensees; put it in every advertisement (or link from social media).",
      'Build the three-business-day cancellation window and deposit-return handling into contracts and escrow instructions.',
      'Track 90-day and $10,000 thresholds per property to know when the regime applies.',
    ],
    confidence: 'high',
  },
  {
    code: 'PA',
    name: 'Pennsylvania',
    researchedAt: '2026-10-22',
    summary:
      "Act 52 of 2024 (SB 1173), effective January 4, 2025, amended the Real Estate Licensing and Registration Act so that any person who engages or attempts to engage in a 'wholesale transaction' (promoting the sale or purchase of an equitable interest in 1-4 unit residential property with intent to transfer it for a fee without taking record title) is a 'broker', whether acting for itself or others, and the owner exclusion no longer applies to wholesale transactions. Wholesale sales agreements must prominently carry four disclosures and give the consumer a non-waivable right to cancel until midnight of the 30th day after signing or until conveyance, whichever is first. Philadelphia separately requires an annual Residential Property Wholesaler license and a signed pre-offer disclosure.",
    proposedClassification: 'C',
    classificationRationale:
      "The statute text itself makes a wholesale transaction a licensed broker activity with no frequency threshold and no principal or owner carve-out, so unlicensed assignment of residential contracts for a fee is not available. The only structure that appears to fall outside the definition is a genuine purchase in which the company takes record title before reselling, and even that needs counsel review because promoting the property before closing may itself be a wholesale transaction. Conditions (disclosures, 30-day cancellation) and Philadelphia's local license stack on top of the license requirement.",
    regulator: {
      name: 'Pennsylvania State Real Estate Commission (Department of State, Bureau of Professional and Occupational Affairs)',
      url: 'https://www.pa.gov/agencies/dos/department-and-offices/bpoa/boards-commissions/real-estate-commission',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'no',
        note: "Act 52 adds to the 'broker' definition any person who, for itself or for another, engages or attempts to engage in a wholesale transaction, and amends section 304(1) so the owner exclusion does not apply to a wholesale transaction. Assigning one's own residential contract for a fee without taking title is the defined activity.",
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No separate state wholesaler registration exists; the state requires a real estate license instead. Philadelphia requires a city Residential Property Wholesaler license (see local_restrictions). Pending HB 600 (2025-2026) would create a housing wholesaler registration/licensing scheme but was last shown referred to committee.',
        sourceIds: ['s1', 's2', 's4'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'A real estate license is required for any wholesale transaction involving residential property (1-4 dwelling units in PA). The text contains no transaction-count threshold; a single attempt is covered. A salesperson may engage in wholesale transactions only for and on behalf of the employing broker.',
        sourceIds: ['s1', 's6'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'New RELRA section 610(e) requires the sales agreement to prominently include four statements, in a manner and method the Commission is to set by regulation (no regulation located). Philadelphia adds a separate pre-offer disclosure.',
        sourceIds: ['s1', 's2', 's3'],
        items: [
          {
            audience: 'seller',
            description:
              'Statement that the agreement is a wholesale transaction in which the licensee intends to assign, sell or transfer the interest for a fee without taking record title.',
            timing: 'In the sales agreement, prominently, at signing',
          },
          {
            audience: 'seller',
            description:
              "Statement of the consumer's right to obtain an appraisal from a certified appraiser, consult an unaffiliated licensee, or seek legal counsel before or after signing.",
            timing: 'In the sales agreement, at signing',
          },
          {
            audience: 'seller',
            description:
              'Statement of the 30-day (or until conveyance) right to cancel and the permitted delivery methods for the cancellation notice.',
            timing: 'In the sales agreement, at signing',
          },
          {
            audience: 'seller',
            description:
              'Statement that all payments are refunded within ten business days after receipt of a cancellation notice.',
            timing: 'In the sales agreement, at signing',
          },
          {
            audience: 'seller',
            description:
              "Philadelphia only: written disclosure on resources to assess fair value (including the Office of Property Assessment website) and the owner's ability to hire an agent or attorney, signed by the homeowner.",
            timing: 'At least 3 days before presenting an offer to purchase',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: "For an unlicensed person, no: the wholesale transaction definition is built on 'undertaking to promote' the sale of the equitable interest, so publicly advertising the property or the contract while holding only an equitable interest is the licensed activity. A licensee may do so subject to the disclosures.",
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'no',
        note: 'No exemption was found for private or direct marketing to known investors; promoting the sale of the equitable interest to anyone for a fee falls within the definition. Counsel should confirm there is no isolated-sale or investor-only reading.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'Assignment itself is not prohibited, but it may be done only by a licensee, and a wholesale sales agreement without the section 610(e) disclosures can be cancelled by the consumer at any time before conveyance. The cancellation right cannot be waived.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'The definition covers transfers made without having taken title as owner of record, and the owner exclusion still covers property actually owned, so buying with own funds, taking record title, then reselling appears outside the wholesale definition. Risk: marketing the property to end buyers before the first closing may itself be promoting an equitable interest. Counsel must confirm.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: 'A consumer party to a wholesale transaction may cancel until midnight of the 30th day after executing the agreement, or until conveyance, whichever is first; if the required disclosures are missing, until conveyance. Refund within ten business days; no damages for cancelling; right is non-waivable.',
        sourceIds: ['s1'],
        deadline: {
          days: 30,
          businessDays: false,
          trigger:
            'after the consumer executes the sales agreement (ends earlier at conveyance)',
        },
      },
      local_restrictions: {
        answer: 'yes',
        note: 'Philadelphia (Philadelphia Code Title 9, cited by the city as 9-5200) requires a Residential Property Wholesaler license for businesses that buy residential property exclusively for resale or solicit owners to sell for resale: $200 initial and annual fee, BIRT tax ID, Commercial Activity License, $1M per-occurrence general liability insurance naming the City, PA State Police background check, city tax compliance. The city lists exceptions including PA-licensed attorneys and real estate agents. A secondary source reports agreements by an unlicensed wholesaler may be rescinded by the owner until title transfers. Other municipalities not checked.',
        sourceIds: ['s2', 's3'],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must file a Foreign Registration Statement with the PA Department of State (15 Pa.C.S. 411/412) before doing business, listing a PA registered office or a commercial registered office provider; secondary sources report a $250 fee. Separately, a broker license would be needed for wholesaling activity. Local tax registrations (e.g., Philadelphia BIRT) apply where relevant.',
        sourceIds: ['s5', 's7'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Act of Jul. 8, 2024, P.L. 545, No. 52 (SB 1173), amending 63 P.S. RELRA sections 201, 304 and adding section 610',
        title:
          'Real Estate Licensing and Registration Act - Exclusions, Right to Cancel Sales Agreements or Sales Contracts for Wholesale Transactions (printout of the official legis.state.pa.us act page)',
        url: 'https://go.stewart.com/rs/067-YWO-436/images/2024%20Act%2052%20-%20PA%20General%20Assembly.pdf?version=0',
        type: 'statute',
        effectiveDate: '2025-01-04',
        summary:
          'Defines wholesale transaction, makes anyone engaging in one a broker, removes the owner exclusion for wholesale transactions, and adds a 30-day non-waivable consumer cancellation right with four mandatory contract disclosures; effective 180 days after July 8, 2024.',
      },
      {
        id: 's2',
        citation:
          'City of Philadelphia, Department of Licenses and Inspections',
        title: 'Get a Residential Property Wholesaler license',
        url: 'https://phila.gov/services/permits-violations-licenses/rent-or-sell-property/get-a-residential-property-wholesaler-license',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'City page describing who needs the wholesaler license, the $200 fee, insurance, background check and tax prerequisites, citing Philadelphia Code Title 9.',
      },
      {
        id: 's3',
        citation: 'Nochumson P.C. article',
        title:
          'Philadelphia Imposes New Rules And Regulations On Residential Property Wholesalers',
        url: 'https://nochumson.com/philadelphia-imposes-new-rules-and-regulations',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Law firm summary of the Philadelphia wholesaler ordinance: annual license, 3-day pre-offer disclosure, and owner rescission of agreements made by unlicensed wholesalers.',
      },
      {
        id: 's4',
        citation: 'PA HB 600, 2025-2026 Regular Session',
        title: 'An Act providing for regulation of housing wholesalers',
        url: 'https://www.palegis.us/legislation/bills/2025/hb600',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Introduced February 12, 2025 by Rep. Neilson and referred to the House Professional Licensure Committee; would add housing wholesaler registration/licensing.',
      },
      {
        id: 's5',
        citation:
          'Pennsylvania Department of State, Bureau of Corporations and Charitable Organizations',
        title:
          'Registration of Foreign Associations - General Rule and Exclusions',
        url: 'https://www.pa.gov/agencies/dos/programs/business/types-of-filings-and-registrations/foreign-associations/general-rule-and-exclusions-for-registration-of-foreign-associat',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "Department of State guidance that foreign associations doing business in PA must register, with listed activities excluded from 'doing business'.",
      },
      {
        id: 's6',
        citation: 'Barley Snyder article',
        title:
          'Act 52 Imposes New Regulations on Real Estate Wholesaling in Pennsylvania',
        url: 'https://www.barley.com/act-52-imposes-new-regulations-on-real-estate-wholesaling-in-pennsylvania/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Law firm summary confirming Act 52 took effect January 4, 2025 and requires wholesalers to be licensed by the State Real Estate Commission.',
      },
      {
        id: 's7',
        citation: 'Harbor Compliance',
        title: 'Pennsylvania Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-pennsylvania-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide reporting the $250 foreign registration fee and registered office or CROP requirement under 15 Pa.C.S. 411.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 600',
        session: '2025-2026',
        status:
          'Referred to House Professional Licensure Committee on 2025-02-12 (latest action shown)',
        url: 'https://www.palegis.us/legislation/bills/2025/hb600',
        summary:
          'Would regulate housing wholesalers through a registration/licensing scheme administered by the State Real Estate Commission; secondary summaries mention background checks and a do-not-solicit list.',
      },
    ],
    openQuestions: [
      'Has the State Real Estate Commission adopted the regulation prescribing the manner and method of the section 610(e) disclosures, and what format is safe until it does?',
      "Does 'consumer' in section 610 include the end buyer/assignee as well as the seller, so that end buyers also get a 30-day cancellation right?",
      "In a double close, does marketing the property to end buyers before the company takes record title make the deal a 'wholesale transaction' requiring a license?",
      'Which entity and which individuals must hold licenses (broker entity license, employing broker, salespersons for acquisitions staff)?',
      'Does the Philadelphia wholesaler license apply to a state-licensed broker entity, and what is the exact Philadelphia Code chapter and rescission remedy?',
      'Do Pittsburgh or other PA municipalities regulate wholesalers or solicitation of homeowners?',
    ],
    activationSteps: [
      'Do not operate PA residential wholesale assignments unlicensed; obtain a PA broker license for the operating entity (or partner with a PA-licensed broker of record) before any marketing.',
      'Add the four section 610(e) statements prominently to every PA wholesale purchase agreement and track the 30-day cancellation window and 10-business-day refund deadline.',
      'For Philadelphia properties, obtain the city Residential Property Wholesaler license (BIRT, CAL, insurance, background check) unless counsel confirms an exception, and collect the signed pre-offer disclosure at least 3 days before any offer.',
      'File a Foreign Registration Statement with the PA Department of State and appoint a registered office or CROP.',
      'Monitor HB 600 and any Commission rulemaking on the disclosure format.',
    ],
    confidence: 'high',
  },
  {
    code: 'RI',
    name: 'Rhode Island',
    researchedAt: '2026-10-22',
    summary:
      'S 3136 (Substitute A reviewed) was signed June 23, 2026 and takes effect January 1, 2027. It adds to the broker definition anyone who secures, negotiates or facilitates sales to transfer an equitable interest for gain before taking ownership more than once in any 12 months, removes the owner exemption for sales of equitable interests, and adds R.I. Gen. Laws chapter 34-51 requiring a license or exemption, written disclosures to seller and buyer, a non-waivable three-business-day cancellation period for both, and fines plus civil liability of up to three times the profit. Until January 1, 2027, no wholesaling-specific rule was found.',
    proposedClassification: 'C',
    classificationRationale:
      'From January 1, 2027 a real estate license (or an exemption) is required to enter wholesale or assignment contracts for anyone doing it more than once in 12 months, which is classification C. Conditions (disclosures, 3-business-day cancellation for seller and buyer, no transfer during the period) also apply. Confidence is medium because the enacted text and public law number should be confirmed against Substitute A, and the interaction with the unchanged investment exemption is unclear.',
    regulator: {
      name: 'Rhode Island Department of Business Regulation (real estate licensing)',
      url: 'https://dbr.ri.gov/real-estate',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Before 2027-01-01 no wholesaling rule was found, and the owner and investment exemptions apply. From 2027-01-01, a person who assigns equitable interests more than once in 12 months is a broker; the owner exemption no longer covers sale of an equitable interest. A single assignment in a 12-month period appears outside the definition.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'The new law requires a real estate license or an exemption, not a separate wholesaler registration.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Yes from 2027-01-01 for anyone who wholesales more than once in any 12-month period: no one may enter a wholesale or assignment contract without an active DBR license or an exemption under 5-20.5-2. Licensed or registered builders and developers dealing in vacant land or new construction are excluded.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Effective 2027-01-01 under new chapter 34-51.',
        sourceIds: ['s1'],
        items: [
          {
            audience: 'seller',
            description:
              'Written disclosure that the wholesaler may assign the contract to another person for a fee or other consideration.',
            timing: 'Before entering into the purchase contract',
          },
          {
            audience: 'seller',
            description:
              'Contract notice of a three-business-day period to review with an attorney or advisor and to cancel without reason or penalty, apart from returning any deposit.',
            timing: 'In the wholesale contract',
          },
          {
            audience: 'buyer',
            description:
              'Written disclosure that the wholesaler holds an equitable interest but not legal title.',
            timing: 'Before entering into the assignment contract',
          },
          {
            audience: 'buyer',
            description:
              'Assignment contract notice of a three-business-day review and cancellation period; the contract may not bar the assignee from using its own closing attorney, settlement agent or title insurer.',
            timing: 'In the assignment contract',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Until 2027-01-01 no restriction found. Afterward, an unlicensed repeat wholesaler may not secure, negotiate or facilitate sales of its equitable interest, and the broker definition already covers advertising oneself as engaged in broker activities; public marketing by an unlicensed repeat wholesaler would not be available.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Same as public marketing: allowed for licensees (or exempt persons) from 2027; the definition does not distinguish private outreach to known investors.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'yes',
        note: 'From 2027-01-01: no transfer or assignment until the cancellation periods expire; the cancellation right cannot be waived; missing disclosures let the seller or buyer cancel any time before consummation, with deposit refunds to buyers; fines of $500 for a first and $1,000 for later violations, plus civil liability of one to three times the fee or profit.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "The definition targets transfers of an equitable interest before taking possession or legal ownership, so a real purchase followed by resale appears outside it. A transfer of property under a wholesale contract still cannot occur until the seller's cancellation period ends.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'yes',
        note: 'Effective 2027-01-01: three business days (excluding weekends and federal or state holidays) without reason or penalty; if disclosures are missing, until consummation. The statute does not state the trigger explicitly; the contract execution date is assumed.',
        sourceIds: ['s1'],
        deadline: {
          days: 3,
          businessDays: true,
          trigger:
            'after the seller signs the wholesale contract (effective 2027-01-01)',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'R.I. Gen. Laws 7-16-49: a foreign LLC must register with the Secretary of State before transacting business and name a resident agent.',
        sourceIds: ['s4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'R.I. 2026 S 3136 Substitute A (LC006171/SUB A/2), amending R.I. Gen. Laws 5-20.5-1 and 5-20.5-2 and adding chapter 34-51',
        title:
          'An Act relating to businesses and professions - real estate brokers and salespersons',
        url: 'https://webserver.rilegislature.gov/BillText26/SenateText26/S3136A.pdf',
        type: 'bill',
        effectiveDate: '2027-01-01',
        summary:
          'Requires licensing for repeat wholesalers, removes the owner exemption for equitable-interest sales, and adds seller and buyer disclosures, 3-business-day cancellation rights and penalties, effective January 1, 2027.',
      },
      {
        id: 's2',
        citation: 'FastDemocracy bill tracker, RI SB 3136 (2026)',
        title: 'Rhode Island SB 3136 action history',
        url: 'https://fastdemocracy.com/bill/ri/2026/bills/RIB00035963',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Shows SB 3136 passed the Senate June 4 and House June 9, 2026, was transmitted June 18 and signed by the Governor June 23, 2026.',
      },
      {
        id: 's3',
        citation: 'R.I. 2026 H 7840',
        title: 'House companion bill on real estate brokers and wholesaling',
        url: 'https://webserver.rilegislature.gov/BillText26/HouseText26/H7840.htm',
        type: 'bill',
        effectiveDate: null,
        summary:
          'House version introduced February 27, 2026 with the same licensing, disclosure and 3-business-day cancellation framework, effective January 1, 2027.',
      },
      {
        id: 's4',
        citation: 'R.I. Gen. Laws 7-16-49',
        title: 'Registration of foreign limited liability company',
        url: 'https://webserver.rilegislature.gov/Statutes/TITLE7/7-16/7-16-49.htm',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires a foreign LLC to register with the Secretary of State, naming a resident agent, before transacting business in Rhode Island.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Confirm the enacted text is S 3136 Substitute A as reviewed, and obtain the public law number.',
      'Can a wholesaler rely on the unchanged exemption for persons dealing in real estate held for investment (5-20.5-2(a)(3)) to qualify under 34-51-2(2) without a license?',
      'Does a single wholesale deal in a 12-month period fall entirely outside chapter 34-51, including its disclosure and cancellation rules?',
      'What triggers the three-business-day period (seller signature or full execution), and must closings be scheduled after it ends?',
      'How will DBR license entities that wholesale, and is there transition guidance for contracts signed before 2027-01-01 that close after?',
    ],
    activationSteps: [
      'Before 2027-01-01, plan for a DBR real estate broker license for the operating entity or a licensed broker partner for Rhode Island deals.',
      'Add the seller pre-contract assignment disclosure and the buyer equitable-interest disclosure, each with 3-business-day cancellation language, to RI templates.',
      "Block assignment and closing until both cancellation periods have expired, and never restrict the assignee's choice of closing attorney or title insurer.",
      'Register the LLC with the RI Secretary of State and appoint a resident agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'SC',
    name: 'South Carolina',
    researchedAt: '2026-10-22',
    summary:
      "South Carolina's 2024 rewrite of the Real Estate Practice Act (Act 204, H. 4754, effective 2024-05-21) defines wholesaling as marketing residential property one has under contract before taking legal title. It treats advertising another's property for compensation as brokerage requiring a license, and bars licensed brokerages from engaging in or assisting wholesaling. Assigning a contract is not itself wholesaling, and advertising a contractual position is allowed only if it does not imply or market the underlying property, which the Commission's November 2024 advisory opinion calls practically impossible. Taking title first and then reselling as owner falls within the owner exemption.",
    proposedClassification: 'D',
    classificationRationale:
      "Marketing a contracted property before taking title is wholesaling, and wholesaling is effectively prohibited: unlicensed persons need a license to market another's property, and licensees are barred from wholesaling. A license or a brokerage partner therefore does not cure it, so C is wrong. Assignment without marketing and principal purchase then resale remain available, which is the D pattern ('another structure may work').",
    regulator: {
      name: 'South Carolina Real Estate Commission (Department of Labor, Licensing and Regulation)',
      url: 'https://llr.sc.gov/re/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "40-57-30(44) says wholesaling does not refer to assigning or offering to assign a contract right to buy residential real estate. The Commission's advisory opinion holds that an assignment becomes wholesaling when combined with marketing or advertising the property before taking title with an expectation of compensation. Unmarketed assignments (to a spouse, one's own entity, or an investor who approaches the holder) are permitted.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration exists; the statute defines and restricts wholesaling through the license law instead.',
        sourceIds: ['s1', 's3'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'Necessary but not sufficient. 40-57-30(44) says advertising or marketing real estate owned by another with an expectation of compensation is broker activity requiring licensure, but 40-57-350 bars brokerages and their licensees from engaging in, representing others in, or assisting wholesaling, so typical wholesaling cannot be made lawful by licensing. No frequency threshold; the definition covers residential real estate. LLR says citations may issue against unlicensed individuals and maximum fines are now $10,000 per violation.',
        sourceIds: ['s1', 's2', 's3'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No wholesaling disclosure regime; the statute restricts marketing instead. Licensees transacting for themselves must reveal license status (40-57-135(F)(1)), which does not apply to an unlicensed principal.',
        sourceIds: ['s1', 's3'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'no',
        note: '40-57-135(E)(1) permits advertising a contractual position only if it does not imply, suggest, or purport to market the underlying property. The Commission says compliance is practically impossible: any photo, plat, address, tax map number, bed or bath count, square footage, condition, rental history, neighborhood, or other property detail likely violates it, and a header disclaimer does not cure it. Marketing includes MLS, social media, print, Facebook groups, private email groups, and verbal communication.',
        sourceIds: ['s1', 's2'],
      },
      direct_investor_outreach_permitted: {
        answer: 'no',
        note: 'Outreach to known investors with any property details is marketing under the advisory opinion (private email groups and verbal communication count). The only compliance example given is an investor approaching the contract holder about contracts in an area without any marketing effort by the holder.',
        sourceIds: ['s2'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'Assignment itself is not prohibited, but an assignment for compensation preceded by marketing the property before taking title is prohibited wholesaling. Licensed brokerages may not assist wholesaling transactions.',
        sourceIds: ['s1', 's2'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "40-57-240(1) exempts an unlicensed owner selling an interest identical to its legal interest, so reselling after Hālo takes legal title is exempt. Marketing to the end buyer before Hālo's own closing meets the wholesaling definition (marketing before taking legal ownership), so a same-day double close preceded by marketing is not a safe harbor.",
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'The Real Estate Practice Act contains no seller cancellation right for these contracts; other South Carolina law was not researched.',
        sourceIds: ['s1'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found; local rules were not specifically researched.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: "A foreign LLC transacting business must apply to the Secretary of State for a certificate of authority, naming an in-state agent for service of process and attaching a certificate of existence (33-44-1002). An isolated transaction completed within 30 days and not part of a course of similar transactions is not 'transacting business', but owning income-producing real property is. An unregistered LLC cannot sue in South Carolina courts (33-44-1008).",
        sourceIds: ['s4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'S.C. Code Ann. 40-57-30(44), 40-57-135(E), 40-57-240, 40-57-350, as amended by 2024 Act No. 204 (H. 4754)',
        title:
          'South Carolina Code of Laws, Title 40, Chapter 57 (Real Estate Practice Act)',
        url: 'https://www.scstatehouse.gov/code/t40c057.php',
        type: 'statute',
        effectiveDate: '2024-05-21',
        summary:
          'Defines wholesaling, allows contract-position advertising only if it does not market the property, exempts owners selling their legal interest, and bars brokerages from wholesaling.',
      },
      {
        id: 's2',
        citation: 'SC Real Estate Commission advisory opinion (2024-11-14)',
        title:
          'Advisory Opinion on Exceptions to Wholesaling Under Real Estate Practice Act',
        url: 'https://www.llr.sc.gov/re/News/Wholesaling-Assignment-of-Contracts-Guidance.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Holds that an assignment preceded by marketing the property is prohibited wholesaling, and that marketing a contract without implying the property is practically impossible.',
      },
      {
        id: 's3',
        citation:
          'SC LLR, 2024 Changes to the Real Estate Practice Act (June 2024)',
        title: '2024 Changes to the Real Estate Practice Act',
        url: 'https://llr.sc.gov/re/News/2024-PracticeActChanges.pdf',
        type: 'regulator_guidance',
        effectiveDate: '2024-05-21',
        summary:
          'Summarizes Act 204: the new wholesaling definition, the licensee wholesaling bans, contract-position advertising, citations against unlicensed individuals, and the $10,000 maximum fine.',
      },
      {
        id: 's4',
        citation: 'S.C. Code Ann. 33-44-1001 to -1009',
        title:
          'South Carolina Code of Laws, Title 33, Chapter 44, Article 10 (Foreign LLCs)',
        url: 'https://www.scstatehouse.gov/code/t33c044.php',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Foreign LLCs need a certificate of authority with an in-state agent; isolated transactions completed within 30 days are excluded, and unregistered LLCs cannot sue in state courts.',
      },
      {
        id: 's5',
        citation: 'SC LLR, Real Estate 2025 Recap newsletter',
        title: 'Newsletter Real Estate 2025 Recap',
        url: 'https://llr.sc.gov/re/RECPDF/Newsletter_Real%20Estate_2025%20Recap.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          '2025 legislative update covering H. 3947 (continuing education and expired licenses) with no change to the wholesaling provisions.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "May Hālo share property details with an investor who approaches it first (for example under an NDA) without that being 'marketing' under the advisory opinion?",
      "Does the wholesaling definition's 'residential real estate' limit leave commercial property and land outside the ban, given the separate broker definition for marketing another's real estate?",
      'If Hālo lines up an end buyer before its own closing without marketing (an inbound investor), is a same-day double close permitted?',
      'What penalties apply to unlicensed wholesaling (citations under 40-57-725, fines under 40-57-720, civil actions under 40-57-790)? Is the advisory opinion binding or under challenge?',
      'Confirm that no 2025-2026 bill amends 40-57-30(44) or 40-57-135(E). This research could not run a legislature search after the web-search budget ran out.',
    ],
    activationSteps: [
      'Disable public and investor-list marketing of South Carolina residential properties that Hālo has under contract but does not own.',
      'Use principal purchase and resale in South Carolina: close the acquisition, take legal title, then market and resell as owner under 40-57-240(1).',
      'Do not plan on a licensed brokerage partner to market South Carolina wholesale deals; 40-57-350 bars brokerages from assisting wholesaling.',
      "Allow assignments only where there was no marketing (for example to Hālo's own affiliated entity, or to an investor who approached Hālo), and have counsel approve that flow.",
      'Obtain a certificate of authority from the South Carolina Secretary of State with an in-state agent for service of process before transacting business.',
    ],
    confidence: 'high',
  },
  {
    code: 'SD',
    name: 'South Dakota',
    researchedAt: '2026-10-22',
    summary:
      "No South Dakota wholesaling statute, registration or disclosure was found in the Commission's compilation of license laws as of July 1, 2025, and no 2026 bill was found. The broker definition mostly requires acting for another, but also covers anyone in the business of selling real property to the extent a pattern is established, and anyone who deals in options to buy real property, without a for-another limit.",
    proposedClassification: 'E',
    classificationRationale:
      "The pattern-of-sales and options clauses could reach repeated assignments, and the bona fide owner exemption's reach to contract purchasers is untested; no regulator guidance was found. Not enough verified information.",
    regulator: {
      name: 'South Dakota Real Estate Commission (Department of Labor and Regulation)',
      url: 'https://dlr.sd.gov/realestate/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: 'Broker acts mostly require acting for another, but SDCL 36-21A-6(6) (pattern of selling real property) and (11) (dealing in options) have no for-another limit; the owner exemption covers bona fide owners. Application to assignments is untested.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'None found in the July 2025 compilation of South Dakota real estate license laws.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: 'A pattern of selling real property is broker activity unless exempt, but no numeric threshold or wholesaling guidance was found.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'no',
        note: 'No wholesaling disclosure found in the compiled license laws.',
        sourceIds: ['s1'],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'The for-another clause includes advertising or holding out; not resolved for a principal advertising its own contract.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'None found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Bona fide owners are exempt for acts in the regular course of managing or investing in their property, but the pattern-of-selling clause could apply to a high-volume resale business.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC applies to the Secretary of State for a certificate of authority, with a certificate of existence, naming a registered agent.',
        sourceIds: ['s2', 's3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'SDCL 36-21A-6, 36-21A-11, 36-21A-28, 36-21A-29',
        title:
          'South Dakota Real Estate License Laws & Administrative Rules (as of July 1, 2025)',
        url: 'https://dlr.sd.gov/realestate/publications/license_law_book.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Commission compilation of license law: broker definition including pattern of selling and dealing in options, license requirement, and bona fide owner exemption; no wholesaling provisions found.',
      },
      {
        id: 's2',
        citation: 'South Dakota SOS',
        title: 'Foreign LLC Certificate of Authority application',
        url: 'https://sdsos.gov/docs/business/foreignllccertificateofauthority20180215.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Secretary of State form for a foreign LLC certificate of authority naming a registered agent.',
      },
      {
        id: 's3',
        citation: 'SDCL ch. 47-34A',
        title: 'Uniform Limited Liability Company Act',
        url: 'https://sdlegislature.gov/Statutes/47-34A',
        type: 'statute',
        effectiveDate: null,
        summary: 'LLC statute including foreign LLC certificates of authority.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does assigning a purchase contract count toward a 'pattern of selling real property' under SDCL 36-21A-6(6)?",
      'Is a purchase contract with an assignment right treated as dealing in options under 36-21A-6(11)?',
      'Does the South Dakota Real Estate Commission have any wholesaling guidance or enforcement history? None found.',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Obtain a South Dakota counsel opinion (or ask the Commission) on 36-21A-6(6) and (11) before enabling assignments.',
      'Until then, consider a licensed South Dakota broker for marketing, or purchase-and-resale only.',
      'Obtain a certificate of authority and a registered agent.',
    ],
    confidence: 'low',
  },
  {
    code: 'TN',
    name: 'Tennessee',
    researchedAt: '2026-10-22',
    summary:
      "Tennessee's first wholesaling statute (2025 Pub. Ch. 72, SB 909/HB 781, Tenn. Code Ann. 66-4-401 to -403, effective 2025-03-25) expressly permits a buyer to wholesale, meaning assign its equitable interest for more than it paid, on written conditions. The buyer must disclose the nature of its interest to any potential assignee, tell the seller before the contract is executed that it intends to market its interest, and give the seller the assignment's effective date at least three business days ahead. Disclosures must be in bold, large print in the written agreement, and actions for violation must be brought within two years. No license or registration is required by the statute; a 2026 bill that would have lengthened the notice period was rewritten into an unrelated law.",
    proposedClassification: 'B',
    classificationRationale:
      'The statute affirmatively permits wholesaling by a principal buyer subject to written disclosures and a seller notice period, with no license or registration requirement. That is the B pattern. The main residual uncertainty is the remedy for non-compliance and how the general broker definition treats public marketing of the property.',
    regulator: {
      name: 'Tennessee Real Estate Commission',
      url: 'https://www.tn.gov/commerce/regboards/trec.html',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: '66-4-403(a) says a buyer under contract may wholesale the property if it makes the required written disclosures. TREC summarized the law as permitting wholesaling on those disclosures. Wholesaling is defined as assigning the equitable interest to a subsequent purchaser for a higher price than the buyer paid (66-4-402).',
        sourceIds: ['s1', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'Pub. Ch. 72 creates no registration or license; it imposes disclosures only.',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'The statute permits repeated wholesaling with disclosures and sets no frequency threshold. It does not address marketing the property itself; the broker definition (62-13-102) covers soliciting or negotiating sales for others, so acting for the seller or end buyer would still require a license (secondary summary).',
        sourceIds: ['s1', 's3', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'All disclosures must be in bold, large font and included in the written agreement (66-4-403(a)(2)). The part applies to transactions involving real property (66-4-403(c)), not only residential.',
        sourceIds: ['s1', 's2', 's3'],
        items: [
          {
            audience: 'buyer',
            description:
              "Written disclosure to any potential subsequent purchaser or assignee of the nature of the buyer's equitable interest in the property, in bold, large font in the written agreement.",
            timing:
              'Before assignment; deliver with marketing and in the assignment agreement.',
          },
          {
            audience: 'seller',
            description:
              "Written disclosure of the buyer's intent to market its equitable interest, in bold, large font in the written agreement.",
            timing: 'Before the purchase contract is executed.',
          },
          {
            audience: 'seller',
            description:
              "Written notice of the effective date of any assignment of the buyer's interest (where the contract allows assignment).",
            timing:
              "At least three business days before the assignment's effective date.",
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: "The statute contemplates the buyer marketing its equitable interest, since the seller must be told of the intent to market. It does not say what advertising may show; a secondary source warns against advertising the home's photos and address as if the wholesaler owned it.",
        sourceIds: ['s1', 's4'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Permitted, with the written equitable-interest disclosure to each potential assignee.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: "The seller must receive at least three business days' written notice of an assignment's effective date, and the statute refers to assignment 'if the contract allows', so the purchase contract should permit assignment. No seller consent requirement beyond the contract was found.",
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Pub. Ch. 72 regulates assignment of the equitable interest; a buy-then-resell is not an assignment and appears outside it. A secondary source says double closing is lawful under the owner exemption (62-13-104). Not confirmed by an official source.',
        sourceIds: ['s1', 's4'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'Pub. Ch. 72 creates no cancellation right; it provides only a two-year limitations period for actions for violation, without specifying the remedy.',
        sourceIds: ['s1'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county rules were found. A secondary source says Tennessee law applies uniformly in Memphis, Nashville, and elsewhere; local ordinances were not checked.',
        sourceIds: ['s4'],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain a certificate of authority from the Tennessee Secretary of State (form SS-4233), with a certificate of existence dated within 60 days and a Tennessee registered agent and office. The fee is $50 per member, minimum $300 and maximum $3,000 (secondary).',
        sourceIds: ['s6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Tenn. Code Ann. 66-4-401 to -403, added by 2025 Pub. Ch. 72 (SB 909/HB 781)',
        title: 'SB 909 / HB 781, An act relative to wholesaling real property',
        url: 'https://capitol.tn.gov/Bills/114/Bill/SB0909.pdf',
        type: 'bill',
        effectiveDate: '2025-03-25',
        summary:
          "Defines equitable interest and wholesaling and permits wholesaling if the buyer makes bold, large-font written disclosures to assignees and to the seller, including three business days' notice of assignment; two-year limitations period.",
      },
      {
        id: 's2',
        citation: 'Tennessee General Assembly bill history, SB 0909 (114th GA)',
        title: 'Bill Information: SB 0909',
        url: 'https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=SB0909&GA=114',
        type: 'bill',
        effectiveDate: '2025-03-25',
        summary:
          'Shows SB 909/HB 781 enacted as Public Chapter 72, effective 2025-03-25, with no amendments filed.',
      },
      {
        id: 's3',
        citation: 'Tennessee Real Estate Commission newsletter, Spring 2025',
        title: 'The TREC Newsletter (Spring 2025), Legal Update',
        url: 'https://www.tn.gov/content/dam/tn/commerce/documents/regboards/trec/newsletters/Spring-2025.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          "TREC summarizes SB 909 as permitting wholesaling when the buyer discloses its equitable interest to an assignee and gives the seller three days' notice before assignment, effective on signature 2025-03-25.",
      },
      {
        id: 's4',
        citation: 'Real Estate Skills (updated 2026-05-26)',
        title:
          'Is Wholesaling Real Estate Legal In Tennessee? SB 909 & What Changed',
        url: 'https://www.realestateskills.com/blog/wholesaling-real-estate-legal-tennessee',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Says the broker definition covers acts for others, advertising a property as owner is risky, double closing is lawful under the owner exemption, and no local variations exist.',
      },
      {
        id: 's5',
        citation:
          'Tennessee General Assembly bill history, HB 2495 / SB 2273 (114th GA)',
        title: 'Bill Information: HB 2495',
        url: 'https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=HB2495&GA=114',
        type: 'bill',
        effectiveDate: '2026-04-14',
        summary:
          'Enacted as Public Chapter 727 after amendment, addressing club-membership fees and transfer fee covenants rather than wholesaling.',
      },
      {
        id: 's6',
        citation: 'Harbor Compliance, Tennessee foreign LLC',
        title: 'Tennessee Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-tennessee-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          "Summarizes Tennessee's certificate of authority filing for foreign LLCs, fees, the certificate of existence requirement, and the registered agent requirement.",
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 2495 / SB 2273',
        session: '2026 (114th General Assembly)',
        status:
          'Introduced 2026-02-03; per a search-result summary it would have raised the seller assignment notice from three to five business days. Rewritten by amendment into a transfer-fee-covenant bill and enacted as Public Chapter 727 (effective 2026-04-14); the wholesaling change appears not to have been enacted. Verify.',
        url: 'https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=HB2495&GA=114',
        summary:
          'Caption bill on Title 66 real property; the reported wholesaling notice extension did not survive in the enacted version reviewed.',
      },
    ],
    openQuestions: [
      'What remedy does a seller or assignee have for a violation of 66-4-403 (rescission, damages, or a consumer protection claim)? Does non-compliance make the activity unlicensed brokerage?',
      "Which 'written agreement' must carry the bold, large-font disclosures (the purchase contract, the assignment, or both), and what font size satisfies 'large'?",
      'Must the intent-to-market disclosure precede execution of the purchase contract, as the text suggests, and can it be in the contract itself?',
      'Confirm Pub. Ch. 72 reaches non-residential property, as 66-4-403(c) suggests.',
      'Confirm that the wholesaling change in HB 2495 (2026) was not enacted in any form, and watch the 2027 session.',
    ],
    activationSteps: [
      "Add a bold, large-font clause to the Tennessee purchase contract disclosing Hālo's intent to market its equitable interest, signed before contract execution, and make the contract expressly assignable.",
      "Build a workflow that sends the seller written notice of each assignment's effective date at least three business days before it takes effect, and blocks earlier assignment.",
      "Put a bold, large-font disclosure of the nature of Hālo's equitable interest in every Tennessee deal listing and assignment agreement.",
      "Do not represent or negotiate for the seller or the end buyer; market only Hālo's equitable interest.",
      'Obtain a certificate of authority from the Tennessee Secretary of State and appoint a Tennessee registered agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'TX',
    name: 'Texas',
    researchedAt: '2026-10-22',
    summary:
      'Texas lets an unlicensed person sell an option or assign an interest in a contract to buy real property if the person does not otherwise engage in brokerage and discloses the nature of the equitable interest in writing (Occ. Code 1101.0045). Since 2024-01-01 (SB 1577) the written disclosure must go to potential buyers and written notice of the intent to assign must go to the property owner (Prop. Code 5.0205); skipping it makes the activity unlicensed brokerage. No wholesaler registration, frequency threshold, statutory seller cancellation right, or 2025-2026 bill changing these rules was found.',
    proposedClassification: 'B',
    classificationRationale:
      'Unlicensed principal assignments are expressly permitted by statute, but only on conditions: written disclosure of the equitable interest to every potential buyer and written notice to the owner before contracting to assign, and no use of the contract to engage in brokerage. These are disclosure conditions rather than a license or registration requirement, which fits B. The open issue is how far public marketing of the property (as opposed to the contract) may go before it becomes brokerage.',
    regulator: {
      name: 'Texas Real Estate Commission',
      url: 'https://www.trec.texas.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Occ. Code 1101.0045(a), as amended by SB 1577 (eff. 2024-01-01), lets a person acquire an option or contract interest and then sell or assign it without a license if the person (1) does not use it to engage in real estate brokerage and (2) discloses in writing the nature of the equitable interest to any seller or potential buyer. It applies to real property generally, not only residential. TREC states a wholesaler who does not give the notice is engaged in unlicensed brokerage. The provision dates from SB 2212 (2017); SB 1577 added the seller-side disclosure.',
        sourceIds: ['s1', 's2', 's3', 's4'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: "No wholesaler registration exists in the statutes reviewed; the regime is disclosure-based. TREC's 2022 survey article says wholesalers need not be licensed if they disclose their interest to potential buyers and do not otherwise broker.",
        sourceIds: ['s1', 's5'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Not required for repeated assignments if the written disclosures are made and the person does not engage in brokerage (for example acting for the seller or buyer, negotiating for others, or listing the property). The statute has no frequency threshold. Assigning or offering to assign without the disclosure is itself brokerage (1101.0045(b)), so a missed disclosure converts the activity into unlicensed practice.',
        sourceIds: ['s1', 's4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: "Two written disclosures are required by Prop. Code 5.0205 (moved from 5.086 and amended by SB 1577) and Occ. Code 1101.0045(a)(2). The statute sets the timing as before entering into a contract to sell the option or assign the interest; a licensed broker's 2026 article (secondary) reads the seller notice as due before the purchase agreement is signed, which is the conservative practice.",
        sourceIds: ['s1', 's2', 's4', 's6'],
        items: [
          {
            audience: 'buyer',
            description:
              'Written disclosure to any potential buyer that the person is selling only an option or assigning only an interest in a contract and does not hold legal title to the property.',
            timing:
              'Before entering into the contract to sell the option or assign the interest (5.0205); in practice on or before first marketing to that buyer.',
            key: 'equitable_interest_disclosure',
          },
          {
            audience: 'seller',
            description:
              'Written notice to the owner of the property that the person intends to sell an option or assign its interest in the contract.',
            timing:
              'Statute: before entering into the contract to assign. Conservative practice: in or with the purchase contract before the seller signs.',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'The statute contemplates offering to sell an option or assign a contract to potential buyers, and TREC describes wholesaling as marketing an option or equitable interest, so marketing the contract interest with the written disclosure is permitted. Advertising the property as if owned or listed (MLS listing, undisclosed yard signs) is described by a licensed Texas broker (secondary) as unlicensed brokerage. No TREC rule defining permissible wholesale advertising content was found.',
        sourceIds: ['s1', 's4', 's6'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: "Permitted as marketing of the principal's own contract interest, provided each potential buyer gets the written disclosure that only a contract interest is offered and the assignor lacks legal title before the assignment contract is signed.",
        sourceIds: ['s1', 's2'],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No statutory prohibition or seller-consent requirement was found. Prop. Code 5.0205 conditions assignment on the written buyer disclosure and owner notice. Whether the purchase contract itself is assignable is a contract question; a Texas firm (secondary) advises stating assignability expressly in a residential earnest money contract.',
        sourceIds: ['s2', 's8'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "No statute addresses double closings. A licensed Texas brokerage's 2026 article (secondary) says they are lawful but that many national title underwriters decline simultaneous closings. If the property is offered to the end buyer before the first closing, the principal is still offering an equitable interest, so treating the 1101.0045/5.0205 disclosures as applicable is the safe reading (inference for counsel).",
        sourceIds: ['s1', 's6'],
      },
      seller_cancellation_right: {
        answer: 'no',
        note: 'Neither Occ. Code 1101.0045 nor Prop. Code 5.0205 gives the seller a cancellation right, and none was found in this research. Counsel should confirm that no other consumer statute applies to these contracts.',
        sourceIds: ['s1', 's2'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: "No city or county wholesaling rules were found. A Houston broker's 2026 article (secondary) reports no Houston or Harris County-specific rules, but other cities were not checked.",
        sourceIds: ['s6'],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC transacting business in Texas must register with the Secretary of State under Business Organizations Code ch. 9 (Form 304, $750 fee) and keep a Texas registered agent and office (it cannot be its own agent; a mailbox service is not enough). Late filing fees apply once business has been transacted more than 90 days without registration. Franchise tax obligations with the Comptroller were not verified here.',
        sourceIds: ['s7'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          'Tex. Occ. Code 1101.0045, as amended by SB 1577 (88th Leg., R.S., 2023) Sec. 4',
        title: 'S.B. No. 1577, enrolled text',
        url: 'https://capitol.texas.gov/tlodocs/88R/billtext/html/SB01577F.htm',
        type: 'bill',
        effectiveDate: '2024-01-01',
        summary:
          'Amends 1101.0045 so a license-free assignor must not use the contract to broker and must disclose its equitable interest in writing to any seller or potential buyer; non-disclosure is brokerage.',
      },
      {
        id: 's2',
        citation: 'Tex. Prop. Code 5.0205',
        title: 'Sec. 5.0205, Texas Property Code (unofficial compilation)',
        url: 'https://texas.public.law/statutes/tex._prop._code_section_5.0205',
        type: 'statute',
        effectiveDate: '2024-01-01',
        summary:
          'Before contracting to sell an option or assign a contract interest, a person must give potential buyers written notice that only a contract interest is offered and title is not held, and notify the owner in writing of the intent to assign.',
      },
      {
        id: 's3',
        citation: 'SB 2212 (85th Leg., R.S., 2017), bill analysis',
        title: 'Senate Research Center analysis of S.B. 2212',
        url: 'https://capitol.texas.gov/tlodocs/85R/analysis/html/SB02212F.htm',
        type: 'bill',
        effectiveDate: '2017-09-01',
        summary:
          'Original 2017 act adding 1101.0045, allowing unlicensed sale of options or assignment of contract interests if the interest is disclosed to potential buyers.',
      },
      {
        id: 's4',
        citation: 'TREC, 88th Texas Legislative Session Update',
        title:
          '88th Texas Legislative Session Update, and the Impact on License Holders',
        url: 'https://www.trec.texas.gov/article/88th-texas-legislative-session-update-how-it-impacts-license-holders',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'TREC explains that SB 1577 requires the wholesaling notice in writing to the potential buyer and the same written notice to the seller, and that a wholesaler who omits notice is engaged in unlicensed brokerage.',
      },
      {
        id: 's5',
        citation:
          "TREC, Results from TREC's Wholesaling in Texas Survey (2022-03-15)",
        title: "Results from TREC's Wholesaling in Texas Survey",
        url: 'https://www.trec.texas.gov/article/results-trec%E2%80%99s-wholesaling-texas-survey',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'TREC states wholesalers need not be licensed if they disclose the nature of their interest to potential buyers and do not otherwise engage in brokerage; no rule changes proposed.',
      },
      {
        id: 's6',
        citation: 'Harbert Real Estate Group blog (2026-01-01)',
        title:
          'Texas Real Estate Wholesaling 2026: Legal Boundaries and How Houston Wholesalers Operate',
        url: 'https://www.harbertgroup.com/blog/1069/Texas+Real+Estate+Wholesaling+2026%3A+Legal+Boundaries+And+How+Houston+Wholesalers+Operate',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'A licensed Houston brokerage says wholesaling is lawful with written disclosures, MLS listing by unlicensed wholesalers is brokerage, double closings are lawful but title companies often refuse them, and no Houston-specific rules exist.',
      },
      {
        id: 's7',
        citation: 'Texas SOS, Form 304 instructions',
        title:
          'Form 304 - Instructions for Application for Registration of a Foreign Limited Liability Company',
        url: 'https://www.sos.state.tx.us/corp/instructions/304.shtml',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Foreign LLCs transacting business in Texas register under BOC ch. 9 with a $750 fee, must designate a Texas registered agent and office, and face late fees after 90 days unregistered.',
      },
      {
        id: 's8',
        citation: 'Lone Star Land Law, Wholesaling in Texas Real Estate',
        title: 'Wholesaling in Texas Real Estate',
        url: 'https://lonestarlandlaw.com/wholesaling-in-texas-real-estate',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Texas firm article advising that a residential earnest money contract intended for assignment should expressly state it is assignable.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Timing of the owner notice: Prop. Code 5.0205 says before contracting to assign; must it instead (or also) be delivered before the seller signs the purchase contract to satisfy 1101.0045(a)(2)?',
      "What conduct counts as using the contract 'to engage in real estate brokerage' under 1101.0045(a)(1)? In particular, may Hālo publicly advertise the property address and photos if every listing carries the equitable-interest disclosure?",
      "If Hālo's platform lists contracts held by third-party wholesalers rather than its own entity, is the platform itself performing brokerage for those wholesalers?",
      'Franchise tax and any other Comptroller registrations for a foreign LLC earning assignment fees in Texas.',
      'Monitor bills filed for the 90th Legislature (2027 regular session) that would amend 1101.0045 or 5.0205.',
    ],
    activationSteps: [
      'Add a written owner notice of intent to assign (Prop. Code 5.0205(2)) to the Texas purchase contract or a signed addendum delivered before the seller signs.',
      "Put the 5.0205(1) buyer disclosure (only a contract interest is offered; the assignor does not hold legal title) on every Texas deal listing and in the assignment agreement, and record each buyer's receipt before any assignment is signed.",
      'Use a Texas purchase contract that expressly permits assignment.',
      'Market the contract interest only: no MLS listings, no property-for-sale signage, and no representing or negotiating for the seller or end buyer.',
      'Register the LLC with the Texas Secretary of State (Form 304), appoint a Texas registered agent, and confirm franchise tax registration with the Comptroller.',
    ],
    confidence: 'high',
  },
  {
    code: 'UT',
    name: 'Utah',
    researchedAt: '2026-10-22',
    summary:
      "Utah has no wholesaler statute as found, but its principal broker definition covers selling or listing real estate and buying an option with the expectation of valuable consideration, and advertising that business, without a 'for another' limit in those clauses. The owner exemption excludes option holders, and Division rule R162-2f-200 limits 'owner' to sole, joint-tenant or tenant-in-common ownership, so a contract buyer assigning for a fee may not qualify. Foreclosure rescue also requires a license.",
    proposedClassification: 'D',
    classificationRationale:
      "On the 2026 statutory text and the Division's owner rule, assigning or marketing a purchase contract for a fee likely falls within licensed activity without an available exemption, while a company that actually takes title can resell as owner (subject to the anti-evasion clause). No Division guidance specifically on wholesaling was found, so confidence is low and the C class (license required) remains possible.",
    regulator: {
      name: 'Utah Division of Real Estate',
      url: 'https://realestate.utah.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "Utah Code 61-2f-102(30) reaches selling or listing real estate and buying options with expectation of valuable consideration, without a 'for another' limit in those clauses. The owner exemption (61-2f-202) excludes option holders, and rule R162-2f-200 defines owner as holding a sole, joint-tenant or tenant-in-common ownership interest, which a contract purchaser likely lacks. Leaning toward license required; no Division guidance on assignments found.",
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No wholesaler registration appears in Utah Code 61-2f-102 (effective 2026-05-06) or Part 2 (as amended 2026).',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Likely required where the company sells, lists or advertises interests in real estate it does not own for consideration; 61-2f-201 also requires a license for one act of buying or selling for another. Engaging in foreclosure rescue (assisting a borrower to avoid foreclosure in a title-transfer transaction for compensation) requires a license. No frequency threshold.',
        sourceIds: ['s1', 's2', 's3'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: "Utah's advertisement definition covers promoting the availability of real estate or an option on real estate, and advertising as engaged in selling real estate is principal-broker activity; treat unlicensed public marketing of contract interests as high risk.",
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found; same exemption problem applies.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assigning residential purchase contracts was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'An owner acting with reference to its own real estate is exempt (61-2f-202(2)(a)(i)), but the exemption does not cover an interest obtained to evade the chapter rather than for another legitimate business reason (61-2f-202(2)(b)(iii)). For entities, the acts must be performed by officers, members or managers (R162-2f-200).',
        sourceIds: ['s2', 's3'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC may not do business in Utah until it registers with the Division of Corporations (Utah Code 48-3a-902).',
        sourceIds: ['s4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Utah Code 61-2f-102 (effective 5/6/2026)',
        title: 'Utah Code 61-2f-102 Definitions',
        url: 'https://le.utah.gov/xcode/Title61/Chapter2F/C61-2f-S102_2026050620260506.pdf',
        type: 'statute',
        effectiveDate: '2026-05-06',
        summary:
          'Defines principal broker to include selling or listing real estate, buying options, advertising that business, and foreclosure rescue, each with expectation of valuable consideration.',
      },
      {
        id: 's2',
        citation:
          'Utah Code 61-2f-201, 61-2f-202 (Part 2, as amended 2026 Gen. Sess. ch. 142)',
        title: 'Utah Code Title 61 Chapter 2f Part 2 - Licensure',
        url: 'https://le.utah.gov/xcode/Title61/Chapter2F/C61-2f-P2_1800010118000101.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          "Makes unlicensed brokerage unlawful, exempts owners for their own real estate, excludes option holders from 'owner', and denies the exemption to interests acquired to evade licensing.",
      },
      {
        id: 's3',
        citation: 'Utah Admin. Code R162-2f-200',
        title: 'Utah Admin. Code R162-2f-200 - Owner',
        url: 'https://www.law.cornell.edu/regulations/utah/Utah-Admin-Code-R162-2f-200',
        type: 'regulation',
        effectiveDate: null,
        summary:
          'Defines owner as one with sole, joint-tenant or tenant-in-common ownership, excludes option holders, and limits who may act for an entity owner.',
      },
      {
        id: 's4',
        citation: 'Utah Code 48-3a-902',
        title: 'Utah Code Title 48 Chapter 3a Part 9 - Foreign LLCs',
        url: 'https://le.utah.gov/xcode/Title48/Chapter3A/C48-3a-P9_1800010118000101.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Bars a foreign LLC from doing business in Utah until it registers with the Division of Corporations.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does the Utah Division of Real Estate treat a purchase-contract buyer (equitable interest) as a non-owner under R162-2f-200, so that assigning the contract for a fee requires a license?',
      "Does 'sells real estate' in 61-2f-102(30) include selling an equitable interest under a purchase contract?",
      'Would a pre-arranged double close be treated as acquiring title to evade the chapter (61-2f-202(2)(b)(iii))?',
      'Were any wholesaling bills introduced in the 2025 or 2026 Utah sessions? None were found in this pass.',
    ],
    activationSteps: [
      'Register the foreign LLC with the Utah Division of Corporations.',
      'Do not assign or market contracts in Utah until Utah counsel confirms the licensing analysis; consider a Utah principal broker partner.',
      'If operating as principal, take title before marketing and document a legitimate business reason for each acquisition.',
      'Avoid any messaging that offers to help owners avoid foreclosure unless licensed.',
    ],
    confidence: 'low',
  },
  {
    code: 'VT',
    name: 'Vermont',
    researchedAt: '2026-10-22',
    summary:
      'No Vermont wholesaling statute or wholesaling bill was found. 26 V.S.A. section 2211 defines a broker as someone acting for another, for consideration, by a continuing course of conduct, and lists owner exemptions; secondary sources say wholesalers may not need a license under certain conditions. H.607 (2026), on institutional investor purchases of one- and two-family homes, was in committee.',
    proposedClassification: 'A',
    classificationRationale:
      'The broker definition requires acting for another, owners dealing in their own property are exempt, and no wholesaler registration, disclosure or cancellation law was found, which fits classification A. Confidence is low: no Real Estate Commission or OPR guidance on wholesaling was located, and the outcome of H.607 is unknown.',
    regulator: {
      name: 'Vermont Office of Professional Regulation - Real Estate Commission',
      url: 'https://sos.vermont.gov/real-estate-brokers-salespersons/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Section 2211 requires activity for another and by a continuing course of conduct; owners managing their own property are exempt. A secondary guide says wholesalers may not need a license under certain conditions. No commission guidance found.',
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration requirement found in chapter 41 or bills reviewed.',
        sourceIds: ['s1'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Required when acting for another for consideration by a continuing course of conduct, including dealing in options on real estate. No numeric threshold for principals.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure statute found; general consumer-protection duties were not reviewed.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: "Inference from the 'for another' definition only: marketing one's own contract interest is arguably not brokerage, but advertising or holding out as engaged in buying and selling real estate for others is.",
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'Same inference; unverified by guidance.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'Not researched beyond the licensing chapter; none found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Owner exemption and the 'for another' requirement suggest buying and reselling one's own property is not brokerage.",
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific right found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No municipal rules were researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain authority from the Secretary of State and keep a Vermont agent; transacting business without it bars suing in Vermont courts until registered and carries a civil penalty of up to $50 a day (capped at $10,000 a year) plus back fees (11 V.S.A. 4119). Secondary source cites 11 V.S.A. 4112 and a $155 fee.',
        sourceIds: ['s3', 's4'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: '26 V.S.A. section 2211',
        title: 'Definitions; exemptions (real estate brokers and salespersons)',
        url: 'https://legislature.vermont.gov/statutes/section/26/041/02211',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines a broker as one acting for another for consideration by a continuing course of conduct, including options, and lists exemptions including owners.',
      },
      {
        id: 's2',
        citation: 'Ark7 guide',
        title: 'Vermont Real Estate Wholesaling Guide',
        url: 'https://ark7.com/blog/learn/cities/vermont-real-estate-wholesaling-guide/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide (seen in search results) stating wholesalers may not need a Vermont license under certain conditions.',
      },
      {
        id: 's3',
        citation: '11 V.S.A. section 4119',
        title:
          'Effect of failure to have certificate of authority (foreign LLC)',
        url: 'https://legislature.vermont.gov/statutes/section/11/025/04119',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Bars an unauthorized foreign LLC from maintaining Vermont proceedings and imposes daily civil penalties and back fees.',
      },
      {
        id: 's4',
        citation: 'Harbor Compliance',
        title: 'Vermont Foreign Qualification Service',
        url: 'https://www.harborcompliance.com/foreign-vermont-llc',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Commercial guide reporting foreign LLC registration under 11 V.S.A. 4112 with a $155 fee and a recent good standing certificate.',
      },
      {
        id: 's5',
        citation: 'Vt. H.607 (2025-2026)',
        title:
          "An act relating to institutional real estate investors' purchase of single- and two-family residences",
        url: 'https://legislature.vermont.gov/bill/status/2026/H.0607',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Introduced January 8, 2026 and referred to House General and Housing, which held hearings January to March 2026.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'H.607',
        session: '2025-2026',
        status:
          'Referred to House Committee on General and Housing 2026-01-08; hearings held through March 2026; final status not verified',
        url: 'https://legislature.vermont.gov/bill/status/2026/H.0607',
        summary:
          "Would regulate institutional real estate investors' purchases of one- and two-family homes; effect on wholesalers or small investors unknown.",
      },
    ],
    openQuestions: [
      'Has the Vermont Real Estate Commission or OPR addressed contract assignment by unlicensed principals or marketing of properties under contract?',
      'Did H.607 advance or die at the end of the 2026 session, and would its definition of institutional investor reach a wholesaling company or its end buyers?',
      "Does a repeated assignment business amount to a 'continuing course of conduct' for another in any reading?",
    ],
    activationSteps: [
      'Register the LLC with the Vermont Secretary of State and appoint a Vermont registered agent before transacting business.',
      'Obtain counsel confirmation of the principal-assignment position and the status of H.607.',
      "Market only the company's contract interest and never act for sellers or end buyers.",
    ],
    confidence: 'low',
  },
  {
    code: 'VA',
    name: 'Virginia',
    researchedAt: '2026-10-22',
    summary:
      'Since July 1, 2024 the Virginia definition of real estate broker includes anyone who, for compensation, sells, offers to sell, buys, negotiates or otherwise deals in real estate contracts, including assignable contracts, on two or more occasions in any 12-month period. Repeated wholesaling is therefore broker activity requiring a license; a single deal in a 12-month window falls below the statutory threshold. No wholesaler-specific disclosure statute, registration or cancellation right was found, and a 2024 statute bars localities from imposing their own mandatory disclosure requirements on residential sale contracts and advertising.',
    proposedClassification: 'C',
    classificationRationale:
      'Va. Code 54.1-2100 (as amended effective 2024-07-01 by HB 917 / SB 358) makes dealing in real estate contracts, including assignable contracts, on two or more occasions in any 12-month period for compensation a broker activity. A platform that repeatedly acquires and assigns contracts would exceed that threshold, so a real estate license (or conducting the activity through a licensed broker or firm) is required for the intended activity. The owner exemption in 54.1-2103 is written for property owned or leased, and it is not clear that it reaches a mere contract interest.',
    regulator: {
      name: 'Virginia Real Estate Board (Department of Professional and Occupational Regulation)',
      url: 'https://www.dpor.virginia.gov/Boards/Real-Estate',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'Only below the threshold: the broker definition is triggered by dealing in real estate contracts, including assignable contracts, on two or more occasions in any 12-month period for compensation. One assignment-for-fee in a rolling 12-month period appears to fall outside it. The owner/lessor exemption (54.1-2103(A)(1)) covers acts concerning property owned or leased, which may not include an equitable contract interest.',
        sourceIds: ['s1', 's2', 's3'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'The 2024 change folded contract dealing into the broker definition rather than creating a separate wholesaler registration; no registration statute was found.',
        sourceIds: ['s1', 's3'],
      },
      license_required_for_activity: {
        answer: 'yes',
        note: 'A broker license is required once a person buys, sells, offers, negotiates or otherwise deals in real estate contracts (including assignable contracts) for compensation on two or more occasions in any 12-month period. Effective July 1, 2024. Offers count, not only completed assignments.',
        sourceIds: ['s1', 's3'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling-specific disclosure statute was found. General residential disclosure law was not reviewed for wholesale-specific effects.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'conditional',
        note: 'Offering to sell a contract is itself listed in the broker definition, so publicly offering contracts counts toward the two-occasions threshold. Above the threshold, marketing must be done by or through a licensee.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'conditional',
        note: 'The statute does not distinguish between public and private offers; any offer to sell a contract for compensation counts toward the two-in-12-months threshold.',
        sourceIds: ['s1'],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statute restricting assignment of residential purchase contracts as such (consent, notice or prohibition) was found; the regulation is via licensing.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: 'Whether buying title and reselling falls within the owner exemption (acts concerning property owned, incident to management and investment) or is treated as dealing in contracts was not addressed in any source found.',
        sourceIds: ['s2'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No wholesale-specific seller cancellation right was found.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'no',
        note: 'Va. Code 15.2-983.1 (2024) bars localities from establishing or enforcing mandatory disclosure requirements for parties to residential sale contracts, including in contracts and advertising. Other local rules were not found, but the search was not exhaustive.',
        sourceIds: ['s4'],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain a certificate of registration to transact business from the State Corporation Commission before transacting business, naming a Virginia registered office and registered agent. Tax registration was not researched.',
        sourceIds: ['s5'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Va. Code 54.1-2100',
        title: 'Definitions (real estate broker)',
        url: 'https://law.lis.virginia.gov/vacode/title54.1/chapter21/section54.1-2100/',
        type: 'statute',
        effectiveDate: '2024-07-01',
        summary:
          'Broker includes anyone who for compensation deals in real estate contracts, including assignable contracts, on two or more occasions in any 12-month period.',
      },
      {
        id: 's2',
        citation: 'Va. Code 54.1-2103',
        title: 'Exemptions from licensure',
        url: 'https://law.lis.virginia.gov/vacode/title54.1/chapter21/section54.1-2103/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts owners or lessors acting regarding property they own or lease, in the regular course of managing and investing in it; last amended 2025.',
      },
      {
        id: 's3',
        citation: 'HB 917 / SB 358 (2024), summarized by NVAR',
        title: 'New Laws 2024: What You Need to Know for July 1, 2024',
        url: 'https://www.nvar.com/news/2024-06-17/new-laws-2024-what-you-need-to-know-for-july-1-2024',
        type: 'secondary',
        effectiveDate: '2024-07-01',
        summary:
          'Trade summary stating the 2024 bills brought contract assignment for profit within broker licensing, effective July 1, 2024.',
      },
      {
        id: 's4',
        citation: 'Va. Code 15.2-983.1',
        title: 'Local mandatory disclosure requirements prohibited',
        url: 'https://law.lis.virginia.gov/vacode/title15.2/chapter9/section15.2-983.1/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Enacted by 2024 Acts cc. 724 and 769; localities may not impose mandatory disclosure requirements in residential sale contracts, addenda or advertising.',
      },
      {
        id: 's5',
        citation: 'Va. Code 13.1-1052',
        title: 'Foreign LLC certificate of registration',
        url: 'https://law.lis.virginia.gov/vacode/title13.1/chapter12/section13.1-1052/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'A foreign LLC must apply to the State Corporation Commission for a certificate of registration to transact business, with registered office and agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Does entering into purchase contracts with sellers (the acquisition side) count as 'buying' real estate contracts toward the two-occasions threshold, or only the assignment side?",
      'Does the owner/lessor exemption in 54.1-2103(A)(1) ever cover a holder of an equitable interest under a purchase contract?',
      'Is a double closing (taking title then reselling) treated as exempt owner activity or as dealing in contracts?',
      'Must a business entity doing this hold a Virginia firm license in addition to an individual broker license?',
      'Were any 2025 or 2026 Virginia bills on wholesaling disclosures enacted? None was found, but the search was limited.',
    ],
    activationSteps: [
      'Operate Virginia contract assignments through a Virginia-licensed broker or firm, or obtain the license, before exceeding one contract deal in any rolling 12-month period.',
      'Track every Virginia contract offer and assignment per entity on a rolling 12-month basis.',
      'Register the LLC with the Virginia State Corporation Commission and appoint a Virginia registered agent.',
    ],
    confidence: 'high',
  },
  {
    code: 'WA',
    name: 'Washington',
    researchedAt: '2026-10-22',
    summary:
      'No Washington wholesaling statute, registration or Department of Licensing guidance was found. RCW 18.85.011 defines real estate brokerage services as services rendered to or on behalf of another for compensation, which on its face excludes a principal selling its own contract interest. The Distressed Property Conveyances Act (ch. 61.34 RCW) adds a five-business-day cancellation right and transfer bar, but only for conveyances where the homeowner stays and has repurchase or resale-sharing rights.',
    proposedClassification: 'A',
    classificationRationale:
      "The license statute turns on services for another, no wholesaler-specific requirements were found, and the distressed-property regime applies to a narrow transaction type unlike a typical wholesale purchase. Confidence is low because no regulator interpretation of contract assignments or public marketing was located and the 'rendered to another' wording has not been tested against wholesaling in the sources reviewed.",
    regulator: {
      name: 'Washington State Department of Licensing (Real Estate Program)',
      url: 'https://dol.wa.gov',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: 'RCW 18.85.011 brokerage services are services offered or rendered to another or on behalf of another for compensation; a principal assigning its own contract appears outside that definition. No DOL guidance or case on wholesaling was found.',
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'unknown',
        note: 'No wholesaler registration was found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'A license is required for brokerage services for another, including listing, selling, optioning, negotiating, and advertising or holding oneself out as engaged in brokerage. No frequency threshold found.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'conditional',
        note: 'No wholesaling disclosure statute found. Chapter 61.34 RCW requires specific contract terms and notices only for distressed home conveyances (homeowner remains in occupancy with a reconveyance, repurchase option or resale-proceeds promise).',
        sourceIds: ['s2'],
        items: [
          {
            audience: 'seller',
            description:
              'Distressed home conveyance contract terms and the statutory cancellation notice (ch. 61.34 RCW), only where the transaction is a distressed home conveyance.',
            timing: 'In the written contract at signing',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'No source addresses an unlicensed principal advertising a property held under contract; RCW 18.85.011 lists advertising or holding oneself out as engaged in brokerage as a brokerage service.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: "No general restriction found. In a distressed home conveyance, the purchaser may not transfer or encumber its interest until the homeowner's cancellation period expires (RCW 61.34.120).",
        sourceIds: ['s2'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: "Buying and reselling on the company's own account is not a service rendered for another under RCW 18.85.011; distressed home conveyance rules apply only to leaseback or repurchase-type deals.",
        sourceIds: ['s1', 's2'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only for distressed home conveyances: the homeowner may cancel until midnight of the fifth business day after signing, or until 8 a.m. on the last day of the redemption period if earlier (RCW 61.34.100). None found for ordinary wholesale contracts.',
        sourceIds: ['s2'],
        deadline: {
          days: 5,
          businessDays: true,
          trigger: 'after the distressed homeowner signs the contract',
        },
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC doing business in Washington registers with the Secretary of State under chapter 25.15 RCW, appoints a Washington registered agent, and attaches a recent certificate of existence.',
        sourceIds: ['s3'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'RCW 18.85.011',
        title: 'RCW 18.85.011 - Definitions (real estate brokerage services)',
        url: 'https://app.leg.wa.gov/rcw/default.aspx?cite=18.85.011',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines real estate brokerage services as listed services, including listing, selling, optioning, negotiating and advertising, offered or rendered to or on behalf of another for compensation.',
      },
      {
        id: 's2',
        citation: 'Chapter 61.34 RCW',
        title: 'Chapter 61.34 RCW - Distressed property conveyances',
        url: 'https://app.leg.wa.gov/rcw/default.aspx?cite=61.34',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Regulates distressed home conveyances: required contract terms, a five-business-day homeowner cancellation right, and a bar on transfer during the cancellation period.',
      },
      {
        id: 's3',
        citation:
          'Washington Secretary of State, Foreign LLC Registration form',
        title: 'Foreign Limited Liability Company Registration (form)',
        url: 'https://www.sos.wa.gov/_assets/corps/forms/foreignllc_reg2013.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Secretary of State form for registering a foreign LLC under chapter 25.15 RCW, including registered agent consent and certificate of existence.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Has the Department of Licensing taken a position on unlicensed wholesalers advertising properties held under contract?',
      'Were any wholesaling bills introduced in the 2025 or 2026 Washington sessions? None were found in this pass.',
      "Does Washington's Consumer Protection Act enforcement by the Attorney General target wholesaler solicitation practices?",
      'Any city rules (for example Seattle) on residential purchase solicitations?',
    ],
    activationSteps: [
      'Register the foreign LLC with the Washington Secretary of State and appoint a registered agent.',
      'Operate strictly as principal; do not list, negotiate or hold out as providing brokerage services for others.',
      'Avoid leaseback or repurchase structures with distressed homeowners, or comply fully with chapter 61.34 RCW.',
      'Have Washington counsel confirm the public-marketing approach before launch.',
    ],
    confidence: 'low',
  },
  {
    code: 'WV',
    name: 'West Virginia',
    researchedAt: '2026-10-22',
    summary:
      'West Virginia has no enacted wholesaling statute found. Bills to abolish residential wholesaling were introduced in 2025 (HB 3501, and a House floor amendment to SB 747) and in 2026 (HB 4493), but the enrolled SB 747 amended only 30-40-17 and HB 4493 shows only introduction and committee referral. The general license law defines broker broadly (including anyone who for compensation purchases, sells or options any interest in real estate) with an exemption for persons acting on their own behalf as owner, and whether that exemption covers a contract buyer is unresolved. Some secondary sources wrongly report the ban as enacted.',
    proposedClassification: 'E',
    classificationRationale:
      'No statute, rule or Real Estate Commission guidance on wholesaling was found. The broker definition in 30-40-4 is broad and is not limited to acting for others in the text reviewed, and the owner exemption in 30-40-5 has not been shown to cover equitable contract interests. Repeated legislative attempts to abolish wholesaling also signal regulatory hostility. There is not enough verified information to classify the market.',
    regulator: {
      name: 'West Virginia Real Estate Commission',
      url: 'https://rec.wv.gov/',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'unknown',
        note: "30-40-4 defines broker as one who, for compensation or its expectation, lists, sells, purchases, exchanges or options any interest in real estate, or helps procure prospects. 30-40-5 exempts a person acting on his or her own behalf as owner or lessor. Whether a contract buyer assigning its interest is an 'owner' was not addressed in any source found.",
        sourceIds: ['s1', 's2'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration regime was found; the 2025-2026 bills proposed prohibition rather than registration and were not enacted.',
        sourceIds: ['s3', 's4', 's5'],
      },
      license_required_for_activity: {
        answer: 'unknown',
        note: '30-40-3 makes it unlawful to act as a broker without a license. Whether wholesaling is broker activity under 30-40-4 is unresolved. No frequency threshold was found.',
        sourceIds: ['s1', 's7'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure statute was found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'The broker definition includes advertising or holding oneself out as engaged in the listed acts and helping procure prospects, which may reach public marketing of a contract interest for compensation.',
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed in any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No enacted restriction was found. The 2025 amendment and the 2026 bill would have abolished wholesaling, defined as transferring contract rights for a fee without taking title, and would have let the seller cancel before closing.',
        sourceIds: ['s3', 's4'],
      },
      double_closing_permitted: {
        answer: 'unknown',
        note: 'No enacted rule was found. The proposed abolition language targeted transfers made without taking legal title, which suggests a title-taking resale was not its target; this is a lead only.',
        sourceIds: ['s4'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'None enacted was found. The proposed bills would have allowed cancellation before closing if wholesaling occurred.',
        sourceIds: ['s4'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None was researched or found.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC applies to the Secretary of State for a certificate of authority, including registered agent and office details and a certificate of existence from its home jurisdiction. Tax registration was not researched.',
        sourceIds: ['s6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'W. Va. Code 30-40-4',
        title: 'Definitions (broker)',
        url: 'https://code.wvlegislature.gov/30-40-4/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Broker includes anyone who for compensation lists, sells, purchases, exchanges or options any interest in real estate, or procures prospects.',
      },
      {
        id: 's2',
        citation: 'W. Va. Code 30-40-5',
        title: 'Scope of practice; exceptions',
        url: 'https://code.wvlegislature.gov/30-40-5/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Exempts a person acting on his or her own behalf as owner or lessor of real estate, among other exceptions.',
      },
      {
        id: 's3',
        citation: 'HB 4493 (2026 RS)',
        title: 'West Virginia Abolishment of Wholesaling Act (bill history)',
        url: 'https://bills.wvlegislature.gov/bill/history/2026/RS/HB4493',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Introduced January 19, 2026 and referred to House Government Organization; no later action appeared on the page as fetched.',
      },
      {
        id: 's4',
        citation: 'SB 747 (2025 RS), House floor amendment (Lucas, April 8)',
        title:
          'Proposed Article 40A, West Virginia Abolishment of Wholesaling Act',
        url: 'https://www.wvlegislature.gov/legisdocs/chamber/2025/RS/floor_amends/sb747 hfa lucas 4-8 _1.htm',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Proposed amendment that would have abolished wholesaling and given sellers cancellation rights; it is not in the enrolled bill.',
      },
      {
        id: 's5',
        citation: 'SB 747 (2025 RS), enrolled',
        title: 'Enrolled SB 747 (amends 30-40-17 only)',
        url: 'https://www.wvlegislature.gov/Bill_Text_HTML/2025_SESSIONS/RS/bills/sb747 enr.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'The enrolled text amends only 30-40-17 (nonresident broker office) and contains no wholesaling provisions.',
      },
      {
        id: 's6',
        citation: 'W. Va. Code 31B-10-1002',
        title: 'Application for certificate of authority (foreign LLC)',
        url: 'https://code.wvlegislature.gov/31B-10-1002/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'A foreign LLC applies to the Secretary of State for a certificate of authority, with agent, office and home-state existence certificate.',
      },
      {
        id: 's7',
        citation: 'W. Va. Code 30-40-3',
        title: 'License required',
        url: 'https://code.wvlegislature.gov/30-40-3/',
        type: 'statute',
        effectiveDate: null,
        summary:
          'It is unlawful to act as, or advertise as, a real estate broker or salesperson in West Virginia without a license.',
      },
    ],
    pendingLegislation: [
      {
        bill: 'HB 4493',
        session: '2026 RS',
        status:
          "Introduced 2026-01-19 and referred to House Government Organization; no further action appeared on the legislature's history page as fetched.",
        url: 'https://bills.wvlegislature.gov/bill/history/2026/RS/HB4493',
        summary:
          'Would abolish and prohibit residential wholesaling, with seller cancellation rights and a civil penalty.',
      },
      {
        bill: 'HB 3501',
        session: '2025 RS',
        status:
          'Introduced 2025-03-18 per search results; no enactment found. Not independently verified beyond introduction.',
        url: 'https://www.wvlegislature.gov/Bill_Text_HTML/2025_SESSIONS/RS/bills/hb3501 intr.pdf',
        summary: 'Earlier version of the Abolishment of Wholesaling Act.',
      },
    ],
    openQuestions: [
      'Does the owner exemption in 30-40-5 cover a buyer holding only an equitable interest under a purchase contract?',
      "Does assigning one's own contract for a fee fall within 'sells ... any interest in real estate' for compensation under 30-40-4?",
      'Has the West Virginia Real Estate Commission taken any enforcement position on unlicensed wholesaling?',
      'Will the abolition bill be reintroduced in the 2027 session, and would it apply to contracts already signed?',
    ],
    activationSteps: [
      'Do not launch assignment-based wholesaling in West Virginia until counsel confirms the license-law position.',
      'If launching, consider principal purchase and resale (taking title) or participation of a West Virginia-licensed broker.',
      'Monitor the 2027 session for reintroduction of the Abolishment of Wholesaling Act.',
      'Obtain a certificate of authority from the West Virginia Secretary of State.',
    ],
    confidence: 'low',
  },
  {
    code: 'WI',
    name: 'Wisconsin',
    researchedAt: '2026-10-22',
    summary:
      'Wisconsin regulates wholesaling through disclosure: under Wis. Stat. 710.13 (2023 Act 208), a real property wholesaler must give written notice of wholesaler status to the seller by the time it signs the purchase agreement and notice to the assignee before assigning, or either may rescind before closing. The license statute separately treats a pattern of selling interests in real estate (presumptively 5 in one year or 10 in five years) as broker activity whether or not the person owns the real estate.',
    proposedClassification: 'B',
    classificationRationale:
      '710.13 assumes wholesalers operate and conditions the practice on written notices with rescission remedies; Act 208 did not change the broker license sections. The 452.01(2)(b) pattern-of-sales presumption is a material volume condition that counsel must apply to assignments of equitable interests.',
    regulator: {
      name: 'Wisconsin Department of Safety and Professional Services (Real Estate Examining Board)',
      url: 'https://dsps.wi.gov/Pages/RulesStatutes/RealEstate.aspx',
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: '710.13 contemplates wholesalers assigning buyer rights for consideration with notices. But 452.01(2)(b) treats a pattern of selling interests in real estate, presumptively 5 sales in a year or 10 in 5 years, as broker activity whether or not the person owns the real estate.',
        sourceIds: ['s1', 's4'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'No registration; Act 208 created disclosure duties only.',
        sourceIds: ['s1', 's2'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'Likely at volume: if assignments of equitable interests count as sales of interests in real estate, 5 per year or 10 in 5 years is presumptive evidence of brokerage. Not confirmed by regulator guidance.',
        sourceIds: ['s4'],
      },
      disclosures_required: {
        answer: 'yes',
        note: 'Applies to residential real property with 1-4 dwelling units in Wisconsin; rights cannot be waived.',
        sourceIds: ['s1', 's2'],
        items: [
          {
            audience: 'seller',
            description:
              'Written notice that the buyer is a real property wholesaler.',
            timing:
              'No later than entering into the purchase agreement as buyer',
          },
          {
            audience: 'buyer',
            description:
              'Written notice to the third-party assignee that the wholesaler holds an equitable interest as buyer and is conveying its interest in the purchase agreement, not title.',
            timing: 'No later than entering into the assignment contract',
          },
        ],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: 'Not addressed by 710.13; no regulator guidance found on unlicensed advertising of a contract interest.',
        sourceIds: [],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'conditional',
        note: 'No consent requirement, but written notice to the assignee is required before the assignment and the assignee may rescind if it is late.',
        sourceIds: ['s1'],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'No owner exclusion appears in the broker definition, and the pattern-of-sales clause applies whether or not the person owns the real estate, so a high-volume buy-and-resell program may be presumed brokerage.',
        sourceIds: ['s4'],
      },
      seller_cancellation_right: {
        answer: 'conditional',
        note: 'Only if the seller notice was not timely: the seller may rescind without liability and keep deposits; the right ends at closing. 2025 Act 60 lets deposit holders release funds to the rescinding party without liability.',
        sourceIds: ['s1', 's3'],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'None found in a limited search.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC must obtain a certificate of registration from the Department of Financial Institutions and maintain a Wisconsin registered agent and office.',
        sourceIds: ['s6'],
      },
    },
    sources: [
      {
        id: 's1',
        citation: 'Wis. Stat. 710.13',
        title: 'Disclosures regarding real property wholesalers',
        url: 'https://docs.legis.wisconsin.gov/statutes/statutes/710/13',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Requires written wholesaler notices to the seller and to the assignee, gives each a rescission right before closing if notice is late, and bars waiver.',
      },
      {
        id: 's2',
        citation: '2023 Wisconsin Act 208',
        title: 'Act 208 (real estate practice; wholesaler disclosures)',
        url: 'https://docs.legis.wisconsin.gov/2023/related/acts/208',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Enacted 2024-03-22 and published 2024-03-23; created 710.13, applying to agreements and assignments entered on or after its effective date, and did not amend 452.01 or 452.03.',
      },
      {
        id: 's3',
        citation: '2025 Wisconsin Act 60',
        title: 'Act 60 (2025 SB 193)',
        url: 'https://docs.legis.wisconsin.gov/2025/related/acts/60',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Enacted 2025-12-09; added authority for deposit holders to disburse deposits to a rescinding seller or assignee without liability.',
      },
      {
        id: 's4',
        citation: 'Wis. Stat. 452.01(2)',
        title: 'Definition of broker',
        url: 'https://docs.legis.wisconsin.gov/statutes/statutes/452/01',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Includes anyone engaged in selling interests in real estate to the extent of a pattern, whether or not they own it, with 5 sales a year or 10 in 5 years as presumptive evidence.',
      },
      {
        id: 's5',
        citation: 'Wisconsin REALTORS Association',
        title: 'Real Estate Practice Changes (Jan. 23, 2024)',
        url: 'https://action.wra.org/2024/01/23/real-estate-practice-changes/',
        type: 'secondary',
        effectiveDate: null,
        summary:
          'Trade summary of AB 918/Act 208 describing the new wholesaler status disclosures to sellers and buyers.',
      },
      {
        id: 's6',
        citation: 'Wisconsin DFI',
        title: 'Out of State Organizations (foreign entities)',
        url: 'https://www.wdfi.org/corporations/foreign_entities.htm',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Explains that foreign LLCs must obtain authority or registration from DFI before transacting business and maintain a registered agent.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      "Is assigning a purchase agreement a 'sale' of an 'interest in real estate' for the 452.01(2)(b) pattern presumption, and does the count aggregate affiliated entities?",
      'Does DSPS or the Real Estate Examining Board treat unlicensed public advertising of a contract interest as brokerage?',
      'Can the seller notice be included in the purchase agreement itself or must it be a separate document? The statute says written notice only.',
      'State tax registration (income or franchise tax, withholding, any transaction taxes) and whether contracting to buy and assign property alone counts as transacting business for foreign-registration purposes were not researched.',
    ],
    activationSteps: [
      'Add a written wholesaler-status notice to every Wisconsin seller packet, delivered no later than contract signing.',
      'Add the assignee notice (equitable interest only, not title) to every Wisconsin assignment contract.',
      'Track Wisconsin closings per entity and stop below 5 sales a year unless counsel clears the pattern presumption or a licensed broker is engaged.',
      'Register with DFI as a foreign LLC and appoint a registered agent.',
    ],
    confidence: 'medium',
  },
  {
    code: 'WY',
    name: 'Wyoming',
    researchedAt: '2026-10-22',
    summary:
      'No Wyoming wholesaling statute or Real Estate Commission guidance was found. W.S. 33-28-102 defines real estate activity as listed acts (including dealing in options and procuring prospects) performed by an individual for another and for compensation, and 33-28-104 treats a single such act for another as acting as a licensee. The 2026 amendments (SF0105) changed licensee disclosure rules but added nothing on wholesaling.',
    proposedClassification: 'A',
    classificationRationale:
      "Wyoming's licensing trigger is expressly limited to acts for another and for compensation, an owner exemption exists, and no wholesaler-specific requirement was found in Title 33 or the 2026 amendments. Confidence is low because no regulator interpretation of contract assignments or advertising by a principal was found.",
    regulator: {
      name: 'Wyoming Real Estate Commission',
      url: null,
    },
    findings: {
      principal_assignment_without_license: {
        answer: 'conditional',
        note: "Real estate activity requires acting for another and for compensation (W.S. 33-28-102 'real estate activity'; 33-28-104), so a principal assigning its own contract appears outside licensing; no Commission guidance found.",
        sourceIds: ['s1'],
      },
      wholesaler_registration_required: {
        answer: 'no',
        note: 'Title 33, chapter 28 contains no wholesaler registration; the 2026 amendments (SF0105) did not add one.',
        sourceIds: ['s1', 's3'],
      },
      license_required_for_activity: {
        answer: 'conditional',
        note: 'A license is required for any single act of real estate activity for another, including procuring prospects and dealing in options for another. No frequency threshold found.',
        sourceIds: ['s1'],
      },
      disclosures_required: {
        answer: 'unknown',
        note: 'No wholesaling disclosure requirement found.',
        sourceIds: [],
        items: [],
      },
      public_marketing_permitted: {
        answer: 'unknown',
        note: "Advertising or holding out as engaged in the business of buying or selling real estate is listed real estate activity, though still framed by 'for another'; untested for principals.",
        sourceIds: ['s1'],
      },
      direct_investor_outreach_permitted: {
        answer: 'unknown',
        note: 'Not addressed by any source found.',
        sourceIds: [],
      },
      assignment_restrictions: {
        answer: 'unknown',
        note: 'No statutory consent, notice or prohibition on assignment was found.',
        sourceIds: [],
      },
      double_closing_permitted: {
        answer: 'conditional',
        note: 'Buying and reselling for its own account is not an act for another, and W.S. 33-28-103(a)(i) exempts owners for property they own; counsel to confirm.',
        sourceIds: ['s1'],
      },
      seller_cancellation_right: {
        answer: 'unknown',
        note: 'No statutory seller cancellation right for an ordinary wholesale purchase contract was found; foreclosure-rescue or equity-purchaser statutes (if any) were not verified.',
        sourceIds: [],
      },
      local_restrictions: {
        answer: 'unknown',
        note: 'No city or county wholesaling rules were found in this research pass; not affirmatively ruled out.',
        sourceIds: [],
      },
      out_of_state_entity_requirements: {
        answer: 'yes',
        note: 'A foreign LLC applies to the Secretary of State for a certificate of authority (form cites W.S. 17-16-1533), names a Wyoming registered agent with a physical address, and pays a $150 fee.',
        sourceIds: ['s2'],
      },
    },
    sources: [
      {
        id: 's1',
        citation:
          "W.S. 33-28-102(b) ('real estate activity'), 33-28-103, 33-28-104",
        title:
          'Wyoming Statutes Title 33 (Professions and Occupations), chapter 28',
        url: 'https://wyoleg.gov/statutes/compress/title33.pdf',
        type: 'statute',
        effectiveDate: null,
        summary:
          'Defines real estate activity as listed acts by an individual for another and for compensation, exempts owners, and treats a single act for another as acting as a licensee.',
      },
      {
        id: 's2',
        citation:
          'Wyoming Secretary of State, Foreign LLC Application for Certificate of Authority (rev. June 2021)',
        title: 'FLLC Certificate of Authority form',
        url: 'https://sos.wyo.gov/forms/business/fllc/fllc-certificateauthority.pdf',
        type: 'regulator_guidance',
        effectiveDate: null,
        summary:
          'Form for a foreign LLC to apply for authority to transact business, citing W.S. 17-16-1533, requiring a Wyoming registered agent and a $150 fee.',
      },
      {
        id: 's3',
        citation: 'Wyo. SF0105, Enrolled Act No. 37 (2026 Budget Session)',
        title: 'SF0105 - Real estate brokers and salespersons',
        url: 'https://wyoleg.gov/2026/Enroll/SF0105.pdf',
        type: 'bill',
        effectiveDate: null,
        summary:
          'Amends the definition of customer and licensee relationship disclosures; contains no wholesaling provisions.',
      },
    ],
    pendingLegislation: [],
    openQuestions: [
      'Does the Wyoming Real Estate Commission view public advertising of a property held under contract by an unlicensed principal as real estate activity?',
      'Any Wyoming foreclosure-purchaser or equity-skimming statute affecting purchases from distressed sellers?',
    ],
    activationSteps: [
      'Obtain a Wyoming certificate of authority for the foreign LLC and appoint a registered agent.',
      'Operate strictly as principal; no acts for sellers or buyers.',
      'Have Wyoming counsel confirm the public-marketing approach before launch.',
    ],
    confidence: 'low',
  },
];
