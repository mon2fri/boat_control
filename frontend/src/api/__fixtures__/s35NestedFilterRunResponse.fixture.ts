/* Exact saved-run response snapshot for S35 with the nested filter expression
   Filter 1 AND (Filter 2 OR Filter 3), used by the Overall Results summary tests. */
export const s35NestedFilterRunResponse: unknown = {
  "run_id": "4b9e700766fa",
  "report_name": "baseline_vs_candidate",
  "file_a_name": "baseline.csv",
  "file_b_name": "candidate.csv",
  "created_at": "2026-11-08T12:55:25.177795+00:00",
  "as_of_date": "2026-10-30",
  "upload_refs": [
    "617510eef42899eba16b3a0beff4a1a9af44c3d4175b3011d0b3981d949624c9.csv",
    "e7deb25dbfca4261a09e139e96aa61881d6d6174e8ff80f58ac1c8bbd7100aaa.csv"
  ],
  "result": {
    "comparison": {
      "total_rows_a": 19,
      "total_rows_b": 20,
      "matched_rows": 19,
      "rows_with_changes": 20,
      "total_attribute_changes": 45,
      "row_details": [
        {
          "row_index": 0,
          "key_columns": {
            "id": "1",
            "name": "Alice"
          },
          "attribute_changes": [
            {
              "column": "score",
              "file_a_value": "85",
              "file_b_value": "87"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "Alice",
            "status": "active",
            "region": "North",
            "id": "1",
            "score": "87",
            "sa_flag": "Yes",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 1,
          "key_columns": {
            "id": "2",
            "name": "Bob"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": "active",
              "file_b_value": "inactive"
            },
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "inactive",
            "region": "South"
          },
          "extra_values": {
            "name": "Bob",
            "status": "inactive",
            "region": "South",
            "id": "2",
            "score": "78",
            "sa_flag": "Yes",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 2,
          "key_columns": {
            "id": "5",
            "name": "Eve"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "Eve",
            "status": "active",
            "region": "North",
            "id": "5",
            "score": "74",
            "sa_flag": "No",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 3,
          "key_columns": {
            "id": "6",
            "name": "Frank"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "inactive",
            "region": "South"
          },
          "extra_values": {
            "name": "Frank",
            "status": "inactive",
            "region": "South",
            "id": "6",
            "score": "88",
            "sa_flag": "No",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 4,
          "key_columns": {
            "id": "9",
            "name": "Ivy"
          },
          "attribute_changes": [
            {
              "column": "region",
              "file_a_value": "North",
              "file_b_value": "West"
            },
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Ivy",
            "status": "inactive",
            "region": "West",
            "id": "9",
            "score": "70",
            "sa_flag": null,
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 5,
          "key_columns": {
            "id": "10",
            "name": "Jack"
          },
          "attribute_changes": [
            {
              "column": "score",
              "file_a_value": "89",
              "file_b_value": "91"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Jack",
            "status": "active",
            "region": "South",
            "id": "10",
            "score": "91",
            "sa_flag": null,
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 6,
          "key_columns": {
            "id": "13",
            "name": "Mia"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": "active",
              "file_b_value": "inactive"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "inactive",
            "region": "North"
          },
          "extra_values": {
            "name": "Mia",
            "status": "inactive",
            "region": "North",
            "id": "13",
            "score": "91",
            "sa_flag": "ACDS",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 7,
          "key_columns": {
            "id": "14",
            "name": "Noah"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Noah",
            "status": "active",
            "region": "South",
            "id": "14",
            "score": "68",
            "sa_flag": "ACDS",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 8,
          "key_columns": {
            "id": "17",
            "name": "Quinn"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "inactive",
            "region": "North"
          },
          "extra_values": {
            "name": "Quinn",
            "status": "inactive",
            "region": "North",
            "id": "17",
            "score": "94",
            "sa_flag": "Yes",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 9,
          "key_columns": {
            "id": "18",
            "name": "Rachel"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Rachel",
            "status": "active",
            "region": "South",
            "id": "18",
            "score": "79",
            "sa_flag": "Yes",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 10,
          "key_columns": {
            "id": "21",
            "name": "Uma"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "Uma",
            "status": "active",
            "region": "North",
            "id": "21",
            "score": "73",
            "sa_flag": "No",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 11,
          "key_columns": {
            "id": "22",
            "name": "Vince"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": "inactive",
              "file_b_value": "active"
            },
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "No"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Vince",
            "status": "active",
            "region": "South",
            "id": "22",
            "score": "90",
            "sa_flag": "No",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 12,
          "key_columns": {
            "id": "25",
            "name": "Yara"
          },
          "attribute_changes": [
            {
              "column": "score",
              "file_a_value": "96",
              "file_b_value": "98"
            },
            {
              "column": "sa_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            },
            {
              "column": "cva_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "Yara",
            "status": "active",
            "region": "North",
            "id": "25",
            "score": "98",
            "sa_flag": null,
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 13,
          "key_columns": {
            "id": "26",
            "name": "Zach"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "inactive",
            "region": "South"
          },
          "extra_values": {
            "name": "Zach",
            "status": "inactive",
            "region": "South",
            "id": "26",
            "score": "71",
            "sa_flag": null,
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 14,
          "key_columns": {
            "id": "29",
            "name": "Cathy"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "Yes",
              "file_b_value": "ACDS"
            },
            {
              "column": "cva_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "Cathy",
            "status": "active",
            "region": "North",
            "id": "29",
            "score": "76",
            "sa_flag": "ACDS",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 15,
          "key_columns": {
            "id": "31",
            "name": "Ella"
          },
          "attribute_changes": [
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Ella",
            "status": "active",
            "region": "East",
            "id": "31",
            "score": "85",
            "sa_flag": "ACDS",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 16,
          "key_columns": {
            "id": "34",
            "name": "Harry"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "Yes"
            },
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "inactive",
            "region": "South"
          },
          "extra_values": {
            "name": "Harry",
            "status": "inactive",
            "region": "South",
            "id": "34",
            "score": "92",
            "sa_flag": "Yes",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 17,
          "key_columns": {
            "id": "35",
            "name": "Iris"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": "active",
              "file_b_value": "inactive"
            },
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": "ACDS",
              "file_b_value": "No"
            },
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "oomber"
            }
          ],
          "change_count": 4,
          "grouping_values": {
            "status": "inactive",
            "region": "East"
          },
          "extra_values": {
            "name": "Iris",
            "status": "inactive",
            "region": "East",
            "id": "35",
            "score": "81",
            "sa_flag": "Yes",
            "cva_flag": "No",
            "system": "oomber"
          }
        },
        {
          "row_index": 18,
          "key_columns": {
            "id": "38",
            "name": "Leo"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "Yes"
            },
            {
              "column": "system",
              "file_a_value": "Moodys",
              "file_b_value": "Bloomberg"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Leo",
            "status": "active",
            "region": "South",
            "id": "38",
            "score": "82",
            "sa_flag": "No",
            "cva_flag": "Yes",
            "system": "Bloomberg"
          }
        },
        {
          "row_index": 19,
          "key_columns": {
            "id": "41",
            "name": "Oliver"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": null,
              "file_b_value": "active"
            },
            {
              "column": "region",
              "file_a_value": null,
              "file_b_value": "East"
            },
            {
              "column": "score",
              "file_a_value": null,
              "file_b_value": "84"
            },
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "system",
              "file_a_value": null,
              "file_b_value": "oomber"
            }
          ],
          "change_count": 6,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Oliver",
            "status": "active",
            "region": "East",
            "id": "41",
            "score": "84",
            "sa_flag": "No",
            "cva_flag": "No",
            "system": "oomber"
          }
        }
      ],
      "new_book_count": 1,
      "new_book_details": [
        {
          "row_index": -1,
          "key_columns": {
            "id": "41",
            "name": "Oliver"
          },
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Oliver",
            "status": "active",
            "region": "East",
            "id": "41",
            "score": "84",
            "sa_flag": "No",
            "cva_flag": "No",
            "system": "oomber"
          }
        }
      ]
    },
    "validation": {
      "total_violations": 20,
      "distinct_violating_rows": 20,
      "distinct_violating_attributes": 20,
      "violations_by_rule": {
        "R091": [
          {
            "row_index": 0,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "1",
              "name": "Alice"
            },
            "details": "Column 'id' has value '1' violating R091",
            "violating_column": "id",
            "violating_value": "1",
            "rule_logic": "id less than '0'",
            "comparison_value": "1",
            "extra_values": {
              "name": "Alice",
              "status": "active",
              "region": "North",
              "id": "1",
              "score": "87",
              "sa_flag": "Yes",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Alice",
              "status": "active",
              "score": "87"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_1_Alice",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 1,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "2",
              "name": "Bob"
            },
            "details": "Column 'id' has value '2' violating R091",
            "violating_column": "id",
            "violating_value": "2",
            "rule_logic": "id less than '0'",
            "comparison_value": "2",
            "extra_values": {
              "name": "Bob",
              "status": "inactive",
              "region": "South",
              "id": "2",
              "score": "78",
              "sa_flag": "Yes",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Bob",
              "status": "inactive",
              "score": "78"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_2_Bob",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 2,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "5",
              "name": "Eve"
            },
            "details": "Column 'id' has value '5' violating R091",
            "violating_column": "id",
            "violating_value": "5",
            "rule_logic": "id less than '0'",
            "comparison_value": "5",
            "extra_values": {
              "name": "Eve",
              "status": "active",
              "region": "North",
              "id": "5",
              "score": "74",
              "sa_flag": "No",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Eve",
              "status": "active",
              "score": "74"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_5_Eve",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 3,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "6",
              "name": "Frank"
            },
            "details": "Column 'id' has value '6' violating R091",
            "violating_column": "id",
            "violating_value": "6",
            "rule_logic": "id less than '0'",
            "comparison_value": "6",
            "extra_values": {
              "name": "Frank",
              "status": "inactive",
              "region": "South",
              "id": "6",
              "score": "88",
              "sa_flag": "No",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Frank",
              "status": "inactive",
              "score": "88"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_6_Frank",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 4,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "9",
              "name": "Ivy"
            },
            "details": "Column 'id' has value '9' violating R091",
            "violating_column": "id",
            "violating_value": "9",
            "rule_logic": "id less than '0'",
            "comparison_value": "9",
            "extra_values": {
              "name": "Ivy",
              "status": "inactive",
              "region": "West",
              "id": "9",
              "score": "70",
              "sa_flag": null,
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Ivy",
              "status": "inactive",
              "score": "70"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_9_Ivy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 5,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "10",
              "name": "Jack"
            },
            "details": "Column 'id' has value '10' violating R091",
            "violating_column": "id",
            "violating_value": "10",
            "rule_logic": "id less than '0'",
            "comparison_value": "10",
            "extra_values": {
              "name": "Jack",
              "status": "active",
              "region": "South",
              "id": "10",
              "score": "91",
              "sa_flag": null,
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Jack",
              "status": "active",
              "score": "91"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_10_Jack",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 6,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "13",
              "name": "Mia"
            },
            "details": "Column 'id' has value '13' violating R091",
            "violating_column": "id",
            "violating_value": "13",
            "rule_logic": "id less than '0'",
            "comparison_value": "13",
            "extra_values": {
              "name": "Mia",
              "status": "inactive",
              "region": "North",
              "id": "13",
              "score": "91",
              "sa_flag": "ACDS",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Mia",
              "status": "inactive",
              "score": "91"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_13_Mia",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 7,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "14",
              "name": "Noah"
            },
            "details": "Column 'id' has value '14' violating R091",
            "violating_column": "id",
            "violating_value": "14",
            "rule_logic": "id less than '0'",
            "comparison_value": "14",
            "extra_values": {
              "name": "Noah",
              "status": "active",
              "region": "South",
              "id": "14",
              "score": "68",
              "sa_flag": "ACDS",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Noah",
              "status": "active",
              "score": "68"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_14_Noah",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 8,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "17",
              "name": "Quinn"
            },
            "details": "Column 'id' has value '17' violating R091",
            "violating_column": "id",
            "violating_value": "17",
            "rule_logic": "id less than '0'",
            "comparison_value": "17",
            "extra_values": {
              "name": "Quinn",
              "status": "inactive",
              "region": "North",
              "id": "17",
              "score": "94",
              "sa_flag": "Yes",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Quinn",
              "status": "inactive",
              "score": "94"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_17_Quinn",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 9,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "18",
              "name": "Rachel"
            },
            "details": "Column 'id' has value '18' violating R091",
            "violating_column": "id",
            "violating_value": "18",
            "rule_logic": "id less than '0'",
            "comparison_value": "18",
            "extra_values": {
              "name": "Rachel",
              "status": "active",
              "region": "South",
              "id": "18",
              "score": "79",
              "sa_flag": "Yes",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Rachel",
              "status": "active",
              "score": "79"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_18_Rachel",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 10,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "21",
              "name": "Uma"
            },
            "details": "Column 'id' has value '21' violating R091",
            "violating_column": "id",
            "violating_value": "21",
            "rule_logic": "id less than '0'",
            "comparison_value": "21",
            "extra_values": {
              "name": "Uma",
              "status": "active",
              "region": "North",
              "id": "21",
              "score": "73",
              "sa_flag": "No",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Uma",
              "status": "active",
              "score": "73"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_21_Uma",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 11,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "22",
              "name": "Vince"
            },
            "details": "Column 'id' has value '22' violating R091",
            "violating_column": "id",
            "violating_value": "22",
            "rule_logic": "id less than '0'",
            "comparison_value": "22",
            "extra_values": {
              "name": "Vince",
              "status": "active",
              "region": "South",
              "id": "22",
              "score": "90",
              "sa_flag": "No",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Vince",
              "status": "active",
              "score": "90"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_22_Vince",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 12,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "25",
              "name": "Yara"
            },
            "details": "Column 'id' has value '25' violating R091",
            "violating_column": "id",
            "violating_value": "25",
            "rule_logic": "id less than '0'",
            "comparison_value": "25",
            "extra_values": {
              "name": "Yara",
              "status": "active",
              "region": "North",
              "id": "25",
              "score": "98",
              "sa_flag": null,
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Yara",
              "status": "active",
              "score": "98"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_25_Yara",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 13,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "26",
              "name": "Zach"
            },
            "details": "Column 'id' has value '26' violating R091",
            "violating_column": "id",
            "violating_value": "26",
            "rule_logic": "id less than '0'",
            "comparison_value": "26",
            "extra_values": {
              "name": "Zach",
              "status": "inactive",
              "region": "South",
              "id": "26",
              "score": "71",
              "sa_flag": null,
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Zach",
              "status": "inactive",
              "score": "71"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_26_Zach",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 14,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "29",
              "name": "Cathy"
            },
            "details": "Column 'id' has value '29' violating R091",
            "violating_column": "id",
            "violating_value": "29",
            "rule_logic": "id less than '0'",
            "comparison_value": "29",
            "extra_values": {
              "name": "Cathy",
              "status": "active",
              "region": "North",
              "id": "29",
              "score": "76",
              "sa_flag": "ACDS",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Cathy",
              "status": "active",
              "score": "76"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_29_Cathy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 15,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "31",
              "name": "Ella"
            },
            "details": "Column 'id' has value '31' violating R091",
            "violating_column": "id",
            "violating_value": "31",
            "rule_logic": "id less than '0'",
            "comparison_value": "31",
            "extra_values": {
              "name": "Ella",
              "status": "active",
              "region": "East",
              "id": "31",
              "score": "85",
              "sa_flag": "ACDS",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Ella",
              "status": "active",
              "score": "85"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_31_Ella",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 16,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "34",
              "name": "Harry"
            },
            "details": "Column 'id' has value '34' violating R091",
            "violating_column": "id",
            "violating_value": "34",
            "rule_logic": "id less than '0'",
            "comparison_value": "34",
            "extra_values": {
              "name": "Harry",
              "status": "inactive",
              "region": "South",
              "id": "34",
              "score": "92",
              "sa_flag": "Yes",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Harry",
              "status": "inactive",
              "score": "92"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_34_Harry",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 17,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "35",
              "name": "Iris"
            },
            "details": "Column 'id' has value '35' violating R091",
            "violating_column": "id",
            "violating_value": "35",
            "rule_logic": "id less than '0'",
            "comparison_value": "35",
            "extra_values": {
              "name": "Iris",
              "status": "inactive",
              "region": "East",
              "id": "35",
              "score": "81",
              "sa_flag": "Yes",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Iris",
              "status": "inactive",
              "score": "81"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_35_Iris",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 18,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "38",
              "name": "Leo"
            },
            "details": "Column 'id' has value '38' violating R091",
            "violating_column": "id",
            "violating_value": "38",
            "rule_logic": "id less than '0'",
            "comparison_value": "38",
            "extra_values": {
              "name": "Leo",
              "status": "active",
              "region": "South",
              "id": "38",
              "score": "82",
              "sa_flag": "No",
              "cva_flag": "Yes",
              "system": "Bloomberg"
            },
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Leo",
              "status": "active",
              "score": "82"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_38_Leo",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 19,
            "rule_id": "R091",
            "rule_name": "Catch-All Rule by ID",
            "key_columns": {
              "id": "41",
              "name": "Oliver"
            },
            "details": "Column 'id' has value '41' violating R091",
            "violating_column": "id",
            "violating_value": "41",
            "rule_logic": "id less than '0'",
            "comparison_value": null,
            "extra_values": {
              "name": "Oliver",
              "status": "active",
              "region": "East",
              "id": "41",
              "score": "84",
              "sa_flag": "No",
              "cva_flag": "No",
              "system": "oomber"
            },
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N",
            "detail_values": {
              "name": "Oliver",
              "status": "active",
              "score": "84"
            },
            "exception_id": "CBR1_1F5M13ZKV8YXB7N48F5N_41_Oliver",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          }
        ]
      },
      "violation_count_by_rule": {
        "R091": 20
      },
      "violating_rows_by_rule": {
        "R091": 20
      },
      "violating_attributes_by_rule": {
        "R091": 20
      },
      "rule_summaries": {
        "R091": {
          "name": "Catch-All Rule by ID",
          "description": "",
          "logic": "id less than '0'",
          "condition": "",
          "condition_grouping": "",
          "hide_comparison": false,
          "rule_identifier": "CBR1_1F5M13ZKV8YXB7N48F5N"
        }
      }
    },
    "rule_bindings": {
      "R091": "CBR1_1F5M13ZKV8YXB7N48F5N"
    },
    "common_columns": [
      "name",
      "status",
      "id",
      "region",
      "score",
      "sa_flag",
      "cva_flag",
      "system"
    ],
    "target_columns": [
      "name",
      "status",
      "id",
      "region",
      "score",
      "sa_flag",
      "cva_flag",
      "system"
    ],
    "key_columns": [
      "id",
      "name"
    ],
    "filters_applied": [
      {
        "column": "system",
        "operator": "contains",
        "filter_values": [
          "oomber"
        ]
      },
      {
        "column": "status",
        "operator": "eq",
        "filter_values": [
          "active"
        ]
      },
      {
        "column": "status",
        "operator": "eq",
        "filter_values": [
          "inactive"
        ]
      }
    ],
    "filter_relation": null,
    "filter_grouping_tree": {
      "kind": "and",
      "children": [
        {
          "kind": "leaf",
          "conditionId": "c0"
        },
        {
          "kind": "or",
          "children": [
            {
              "kind": "leaf",
              "conditionId": "c1"
            },
            {
              "kind": "leaf",
              "conditionId": "c2"
            }
          ]
        }
      ]
    },
    "aggregation_columns": [
      "status",
      "region"
    ],
    "aggregation_column_labels": {},
    "nested_aggregation_enabled": true,
    "comparison_sections": [
      {
        "id": "cs-1",
        "name": "TBBBB",
        "columns": [
          "region",
          "status"
        ],
        "extra_columns": []
      },
      {
        "id": "cs-2",
        "name": "asdfadf",
        "columns": [
          "name",
          "status"
        ],
        "extra_columns": []
      }
    ],
    "exception_columns": [
      "name",
      "status",
      "region",
      "id",
      "score",
      "sa_flag",
      "cva_flag",
      "system"
    ],
    "extra_column_display": {
      "overall_result_page": true,
      "overall_html_report": true,
      "overall_excel_report": true,
      "new_books_result_page": true,
      "new_books_html_report": true,
      "new_books_excel_report": true,
      "exception_tables": true
    },
    "group_statistics": {
      "overall": [
        {
          "column": "status",
          "unique_count": 20,
          "attribute_count": 65,
          "rows": [
            {
              "value": "Total",
              "unique_count": 20,
              "attribute_count": 65
            },
            {
              "value": "active",
              "unique_count": 12,
              "attribute_count": 40
            },
            {
              "value": "inactive",
              "unique_count": 8,
              "attribute_count": 25
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 20,
          "attribute_count": 65,
          "rows": [
            {
              "value": "Total",
              "unique_count": 20,
              "attribute_count": 65
            },
            {
              "value": "East",
              "unique_count": 3,
              "attribute_count": 15
            },
            {
              "value": "North",
              "unique_count": 7,
              "attribute_count": 20
            },
            {
              "value": "South",
              "unique_count": 9,
              "attribute_count": 27
            },
            {
              "value": "West",
              "unique_count": 1,
              "attribute_count": 3
            }
          ]
        }
      ],
      "attribute_changes": [
        {
          "column": "status",
          "unique_count": 20,
          "attribute_count": 45,
          "rows": [
            {
              "value": "Total",
              "unique_count": 20,
              "attribute_count": 45
            },
            {
              "value": "active",
              "unique_count": 12,
              "attribute_count": 28
            },
            {
              "value": "inactive",
              "unique_count": 8,
              "attribute_count": 17
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 20,
          "attribute_count": 45,
          "rows": [
            {
              "value": "Total",
              "unique_count": 20,
              "attribute_count": 45
            },
            {
              "value": "East",
              "unique_count": 3,
              "attribute_count": 12
            },
            {
              "value": "North",
              "unique_count": 7,
              "attribute_count": 13
            },
            {
              "value": "South",
              "unique_count": 9,
              "attribute_count": 18
            },
            {
              "value": "West",
              "unique_count": 1,
              "attribute_count": 2
            }
          ]
        }
      ],
      "validation_rules": {
        "R091": [
          {
            "column": "status",
            "unique_count": 20,
            "attribute_count": 20,
            "rows": [
              {
                "value": "Total",
                "unique_count": 20,
                "attribute_count": 20
              },
              {
                "value": "active",
                "unique_count": 12,
                "attribute_count": 12
              },
              {
                "value": "inactive",
                "unique_count": 8,
                "attribute_count": 8
              }
            ]
          },
          {
            "column": "region",
            "unique_count": 20,
            "attribute_count": 20,
            "rows": [
              {
                "value": "Total",
                "unique_count": 20,
                "attribute_count": 20
              },
              {
                "value": "East",
                "unique_count": 3,
                "attribute_count": 3
              },
              {
                "value": "North",
                "unique_count": 7,
                "attribute_count": 7
              },
              {
                "value": "South",
                "unique_count": 9,
                "attribute_count": 9
              },
              {
                "value": "West",
                "unique_count": 1,
                "attribute_count": 1
              }
            ]
          }
        ]
      },
      "new_books": [
        {
          "column": "status",
          "unique_count": 1,
          "attribute_count": 1,
          "rows": [
            {
              "value": "Total",
              "unique_count": 1,
              "attribute_count": 1
            },
            {
              "value": "active",
              "unique_count": 1,
              "attribute_count": 1
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 1,
          "attribute_count": 1,
          "rows": [
            {
              "value": "Total",
              "unique_count": 1,
              "attribute_count": 1
            },
            {
              "value": "East",
              "unique_count": 1,
              "attribute_count": 1
            }
          ]
        }
      ]
    },
    "commentary_template_columns": [
      "name",
      "status",
      "score"
    ],
    "new_exceptions_only": false
  }
};
