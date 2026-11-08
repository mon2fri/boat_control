/* Trimmed? No: exact saved-run response snapshot from the failing S35 + R056/R057 execution. */
export const s35LegacyRunResponse: unknown = {
  "run_id": "e4ad6f7e9feb",
  "report_name": "baseline_vs_candidate",
  "file_a_name": "baseline.csv",
  "file_b_name": "candidate.csv",
  "created_at": "2026-11-08T10:49:07.400943+00:00",
  "as_of_date": "2026-10-30",
  "upload_refs": [
    "617510eef42899eba16b3a0beff4a1a9af44c3d4175b3011d0b3981d949624c9.csv",
    "e7deb25dbfca4261a09e139e96aa61881d6d6174e8ff80f58ac1c8bbd7100aaa.csv"
  ],
  "result": {
    "comparison": {
      "total_rows_a": 37,
      "total_rows_b": 40,
      "matched_rows": 37,
      "rows_with_changes": 38,
      "total_attribute_changes": 94,
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
            "score": "87"
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
            "score": "78"
          }
        },
        {
          "row_index": 2,
          "key_columns": {
            "id": "3",
            "name": "Carol"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "inactive",
            "region": "East"
          },
          "extra_values": {
            "name": "Carol",
            "status": "inactive",
            "region": "East",
            "id": "3",
            "score": "92"
          }
        },
        {
          "row_index": 3,
          "key_columns": {
            "id": "4",
            "name": "David"
          },
          "attribute_changes": [
            {
              "column": "region",
              "file_a_value": "West",
              "file_b_value": "North"
            },
            {
              "column": "score",
              "file_a_value": "66",
              "file_b_value": "69"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "active",
            "region": "North"
          },
          "extra_values": {
            "name": "David",
            "status": "active",
            "region": "North",
            "id": "4",
            "score": "69"
          }
        },
        {
          "row_index": 4,
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
            "score": "74"
          }
        },
        {
          "row_index": 5,
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
            "score": "88"
          }
        },
        {
          "row_index": 7,
          "key_columns": {
            "id": "8",
            "name": "Henry"
          },
          "attribute_changes": [
            {
              "column": "score",
              "file_a_value": "81",
              "file_b_value": "79"
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "active",
            "region": "West"
          },
          "extra_values": {
            "name": "Henry",
            "status": "active",
            "region": "West",
            "id": "8",
            "score": "79"
          }
        },
        {
          "row_index": 8,
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
            "score": "70"
          }
        },
        {
          "row_index": 9,
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
            "score": "91"
          }
        },
        {
          "row_index": 10,
          "key_columns": {
            "id": "11",
            "name": "Karen"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Karen",
            "status": "active",
            "region": "East",
            "id": "11",
            "score": "77"
          }
        },
        {
          "row_index": 11,
          "key_columns": {
            "id": "12",
            "name": "Liam"
          },
          "attribute_changes": [
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 1,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Liam",
            "status": "inactive",
            "region": "West",
            "id": "12",
            "score": "83"
          }
        },
        {
          "row_index": 12,
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
            "score": "91"
          }
        },
        {
          "row_index": 13,
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
            "score": "68"
          }
        },
        {
          "row_index": 14,
          "key_columns": {
            "id": "15",
            "name": "Olivia"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": "inactive",
              "file_b_value": "active"
            },
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Olivia",
            "status": "active",
            "region": "East",
            "id": "15",
            "score": "86"
          }
        },
        {
          "row_index": 16,
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
            "score": "94"
          }
        },
        {
          "row_index": 17,
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
            "score": "79"
          }
        },
        {
          "row_index": 18,
          "key_columns": {
            "id": "19",
            "name": "Sam"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "inactive",
            "region": "East"
          },
          "extra_values": {
            "name": "Sam",
            "status": "inactive",
            "region": "East",
            "id": "19",
            "score": "82"
          }
        },
        {
          "row_index": 19,
          "key_columns": {
            "id": "20",
            "name": "Tina"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": "Yes",
              "file_b_value": "ACDS"
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "West"
          },
          "extra_values": {
            "name": "Tina",
            "status": "active",
            "region": "West",
            "id": "20",
            "score": "87"
          }
        },
        {
          "row_index": 20,
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
            "score": "73"
          }
        },
        {
          "row_index": 21,
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
            "score": "90"
          }
        },
        {
          "row_index": 22,
          "key_columns": {
            "id": "23",
            "name": "Wendy"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            },
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Wendy",
            "status": "active",
            "region": "East",
            "id": "23",
            "score": "65"
          }
        },
        {
          "row_index": 23,
          "key_columns": {
            "id": "24",
            "name": "Xavier"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "ACDS",
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": "Yes",
              "file_b_value": "ACDS"
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Xavier",
            "status": "inactive",
            "region": "West",
            "id": "24",
            "score": "84"
          }
        },
        {
          "row_index": 24,
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
            "score": "98"
          }
        },
        {
          "row_index": 25,
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
            "score": "71"
          }
        },
        {
          "row_index": 26,
          "key_columns": {
            "id": "27",
            "name": "Anna"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            },
            {
              "column": "cva_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            },
            {
              "column": "system",
              "file_a_value": "ABCD",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "active",
            "region": "East"
          },
          "extra_values": {
            "name": "Anna",
            "status": "active",
            "region": "East",
            "id": "27",
            "score": "80"
          }
        },
        {
          "row_index": 27,
          "key_columns": {
            "id": "28",
            "name": "Brad"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "Yes",
              "file_b_value": null
            },
            {
              "column": "cva_flag",
              "file_a_value": "Yes",
              "file_b_value": "ACDS"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Brad",
            "status": "inactive",
            "region": "West",
            "id": "28",
            "score": "93"
          }
        },
        {
          "row_index": 28,
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
            "score": "76"
          }
        },
        {
          "row_index": 29,
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
            "score": "85"
          }
        },
        {
          "row_index": 30,
          "key_columns": {
            "id": "32",
            "name": "Fred"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "ACDS"
            },
            {
              "column": "cva_flag",
              "file_a_value": "Yes",
              "file_b_value": null
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Fred",
            "status": "inactive",
            "region": "West",
            "id": "32",
            "score": "67"
          }
        },
        {
          "row_index": 31,
          "key_columns": {
            "id": "33",
            "name": "Gina"
          },
          "attribute_changes": [
            {
              "column": "region",
              "file_a_value": "North",
              "file_b_value": "South"
            },
            {
              "column": "score",
              "file_a_value": "79",
              "file_b_value": "75"
            },
            {
              "column": "sa_flag",
              "file_a_value": "No",
              "file_b_value": "ACDS"
            },
            {
              "column": "cva_flag",
              "file_a_value": "No",
              "file_b_value": "ACDS"
            },
            {
              "column": "system",
              "file_a_value": "oomber",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 5,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Gina",
            "status": "active",
            "region": "South",
            "id": "33",
            "score": "75"
          }
        },
        {
          "row_index": 32,
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
            "score": "92"
          }
        },
        {
          "row_index": 33,
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
            "score": "81"
          }
        },
        {
          "row_index": 34,
          "key_columns": {
            "id": "36",
            "name": "Jacob"
          },
          "attribute_changes": [
            {
              "column": "cva_flag",
              "file_a_value": "ACDS",
              "file_b_value": null
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 2,
          "grouping_values": {
            "status": "active",
            "region": "West"
          },
          "extra_values": {
            "name": "Jacob",
            "status": "active",
            "region": "West",
            "id": "36",
            "score": "74"
          }
        },
        {
          "row_index": 35,
          "key_columns": {
            "id": "37",
            "name": "Kelly"
          },
          "attribute_changes": [
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "Yes"
            },
            {
              "column": "cva_flag",
              "file_a_value": "No",
              "file_b_value": "ACDS"
            },
            {
              "column": "system",
              "file_a_value": "Bloomberg",
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 3,
          "grouping_values": {
            "status": "inactive",
            "region": "North"
          },
          "extra_values": {
            "name": "Kelly",
            "status": "inactive",
            "region": "North",
            "id": "37",
            "score": "89"
          }
        },
        {
          "row_index": 36,
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
            "score": "82"
          }
        },
        {
          "row_index": 37,
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
            "score": "84"
          }
        },
        {
          "row_index": 38,
          "key_columns": {
            "id": "42",
            "name": "Patricia"
          },
          "attribute_changes": [
            {
              "column": "status",
              "file_a_value": null,
              "file_b_value": "inactive"
            },
            {
              "column": "region",
              "file_a_value": null,
              "file_b_value": "West"
            },
            {
              "column": "score",
              "file_a_value": null,
              "file_b_value": "77"
            },
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "system",
              "file_a_value": null,
              "file_b_value": "Moodys"
            }
          ],
          "change_count": 5,
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Patricia",
            "status": "inactive",
            "region": "West",
            "id": "42",
            "score": "77"
          }
        },
        {
          "row_index": 39,
          "key_columns": {
            "id": "43",
            "name": "Quincy"
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
              "file_b_value": "South"
            },
            {
              "column": "score",
              "file_a_value": null,
              "file_b_value": "80"
            },
            {
              "column": "sa_flag",
              "file_a_value": null,
              "file_b_value": "No"
            },
            {
              "column": "cva_flag",
              "file_a_value": null,
              "file_b_value": "ACDS"
            },
            {
              "column": "system",
              "file_a_value": null,
              "file_b_value": "ABCD"
            }
          ],
          "change_count": 6,
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Quincy",
            "status": "active",
            "region": "South",
            "id": "43",
            "score": "80"
          }
        }
      ],
      "new_book_count": 3,
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
            "score": "84"
          }
        },
        {
          "row_index": -1,
          "key_columns": {
            "id": "42",
            "name": "Patricia"
          },
          "grouping_values": {
            "status": "inactive",
            "region": "West"
          },
          "extra_values": {
            "name": "Patricia",
            "status": "inactive",
            "region": "West",
            "id": "42",
            "score": "77"
          }
        },
        {
          "row_index": -1,
          "key_columns": {
            "id": "43",
            "name": "Quincy"
          },
          "grouping_values": {
            "status": "active",
            "region": "South"
          },
          "extra_values": {
            "name": "Quincy",
            "status": "active",
            "region": "South",
            "id": "43",
            "score": "80"
          }
        }
      ]
    },
    "validation": {
      "total_violations": 48,
      "distinct_violating_rows": 37,
      "distinct_violating_attributes": 48,
      "violations_by_rule": {
        "R057": [
          {
            "row_index": 0,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "1",
              "name": "Alice"
            },
            "details": "Column 'score' has value '87' violating R057",
            "violating_column": "score",
            "violating_value": "87",
            "rule_logic": "score greater than '90'",
            "comparison_value": "85",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Alice",
              "status": "active",
              "score": "87"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_1_Alice",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 1,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "2",
              "name": "Bob"
            },
            "details": "Column 'score' has value '78' violating R057",
            "violating_column": "score",
            "violating_value": "78",
            "rule_logic": "score greater than '90'",
            "comparison_value": "78",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Bob",
              "status": "inactive",
              "score": "78"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_2_Bob",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 3,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "4",
              "name": "David"
            },
            "details": "Column 'score' has value '69' violating R057",
            "violating_column": "score",
            "violating_value": "69",
            "rule_logic": "score greater than '90'",
            "comparison_value": "66",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "David",
              "status": "active",
              "score": "69"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_4_David",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 4,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "5",
              "name": "Eve"
            },
            "details": "Column 'score' has value '74' violating R057",
            "violating_column": "score",
            "violating_value": "74",
            "rule_logic": "score greater than '90'",
            "comparison_value": "74",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Eve",
              "status": "active",
              "score": "74"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_5_Eve",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 5,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "6",
              "name": "Frank"
            },
            "details": "Column 'score' has value '88' violating R057",
            "violating_column": "score",
            "violating_value": "88",
            "rule_logic": "score greater than '90'",
            "comparison_value": "88",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Frank",
              "status": "inactive",
              "score": "88"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_6_Frank",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 7,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "8",
              "name": "Henry"
            },
            "details": "Column 'score' has value '79' violating R057",
            "violating_column": "score",
            "violating_value": "79",
            "rule_logic": "score greater than '90'",
            "comparison_value": "81",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Henry",
              "status": "active",
              "score": "79"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_8_Henry",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 8,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "9",
              "name": "Ivy"
            },
            "details": "Column 'score' has value '70' violating R057",
            "violating_column": "score",
            "violating_value": "70",
            "rule_logic": "score greater than '90'",
            "comparison_value": "70",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Ivy",
              "status": "inactive",
              "score": "70"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_9_Ivy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 10,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "11",
              "name": "Karen"
            },
            "details": "Column 'score' has value '77' violating R057",
            "violating_column": "score",
            "violating_value": "77",
            "rule_logic": "score greater than '90'",
            "comparison_value": "77",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Karen",
              "status": "active",
              "score": "77"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_11_Karen",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 11,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "12",
              "name": "Liam"
            },
            "details": "Column 'score' has value '83' violating R057",
            "violating_column": "score",
            "violating_value": "83",
            "rule_logic": "score greater than '90'",
            "comparison_value": "83",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Liam",
              "status": "inactive",
              "score": "83"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_12_Liam",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 13,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "14",
              "name": "Noah"
            },
            "details": "Column 'score' has value '68' violating R057",
            "violating_column": "score",
            "violating_value": "68",
            "rule_logic": "score greater than '90'",
            "comparison_value": "68",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Noah",
              "status": "active",
              "score": "68"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_14_Noah",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 14,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "15",
              "name": "Olivia"
            },
            "details": "Column 'score' has value '86' violating R057",
            "violating_column": "score",
            "violating_value": "86",
            "rule_logic": "score greater than '90'",
            "comparison_value": "86",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Olivia",
              "status": "active",
              "score": "86"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_15_Olivia",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 15,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "16",
              "name": "Peter"
            },
            "details": "Column 'score' has value '72' violating R057",
            "violating_column": "score",
            "violating_value": "72",
            "rule_logic": "score greater than '90'",
            "comparison_value": "72",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Peter",
              "status": "active",
              "score": "72"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_16_Peter",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 17,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "18",
              "name": "Rachel"
            },
            "details": "Column 'score' has value '79' violating R057",
            "violating_column": "score",
            "violating_value": "79",
            "rule_logic": "score greater than '90'",
            "comparison_value": "79",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Rachel",
              "status": "active",
              "score": "79"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_18_Rachel",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 18,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "19",
              "name": "Sam"
            },
            "details": "Column 'score' has value '82' violating R057",
            "violating_column": "score",
            "violating_value": "82",
            "rule_logic": "score greater than '90'",
            "comparison_value": "82",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Sam",
              "status": "inactive",
              "score": "82"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_19_Sam",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 19,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "20",
              "name": "Tina"
            },
            "details": "Column 'score' has value '87' violating R057",
            "violating_column": "score",
            "violating_value": "87",
            "rule_logic": "score greater than '90'",
            "comparison_value": "87",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Tina",
              "status": "active",
              "score": "87"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_20_Tina",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 20,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "21",
              "name": "Uma"
            },
            "details": "Column 'score' has value '73' violating R057",
            "violating_column": "score",
            "violating_value": "73",
            "rule_logic": "score greater than '90'",
            "comparison_value": "73",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Uma",
              "status": "active",
              "score": "73"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_21_Uma",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 21,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "22",
              "name": "Vince"
            },
            "details": "Column 'score' has value '90' violating R057",
            "violating_column": "score",
            "violating_value": "90",
            "rule_logic": "score greater than '90'",
            "comparison_value": "90",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Vince",
              "status": "active",
              "score": "90"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_22_Vince",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 22,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "23",
              "name": "Wendy"
            },
            "details": "Column 'score' has value '65' violating R057",
            "violating_column": "score",
            "violating_value": "65",
            "rule_logic": "score greater than '90'",
            "comparison_value": "65",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Wendy",
              "status": "active",
              "score": "65"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_23_Wendy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 23,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "24",
              "name": "Xavier"
            },
            "details": "Column 'score' has value '84' violating R057",
            "violating_column": "score",
            "violating_value": "84",
            "rule_logic": "score greater than '90'",
            "comparison_value": "84",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Xavier",
              "status": "inactive",
              "score": "84"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_24_Xavier",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 25,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "26",
              "name": "Zach"
            },
            "details": "Column 'score' has value '71' violating R057",
            "violating_column": "score",
            "violating_value": "71",
            "rule_logic": "score greater than '90'",
            "comparison_value": "71",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Zach",
              "status": "inactive",
              "score": "71"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_26_Zach",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 26,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "27",
              "name": "Anna"
            },
            "details": "Column 'score' has value '80' violating R057",
            "violating_column": "score",
            "violating_value": "80",
            "rule_logic": "score greater than '90'",
            "comparison_value": "80",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Anna",
              "status": "active",
              "score": "80"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_27_Anna",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 28,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "29",
              "name": "Cathy"
            },
            "details": "Column 'score' has value '76' violating R057",
            "violating_column": "score",
            "violating_value": "76",
            "rule_logic": "score greater than '90'",
            "comparison_value": "76",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Cathy",
              "status": "active",
              "score": "76"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_29_Cathy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 29,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "31",
              "name": "Ella"
            },
            "details": "Column 'score' has value '85' violating R057",
            "violating_column": "score",
            "violating_value": "85",
            "rule_logic": "score greater than '90'",
            "comparison_value": "85",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Ella",
              "status": "active",
              "score": "85"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_31_Ella",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 30,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "32",
              "name": "Fred"
            },
            "details": "Column 'score' has value '67' violating R057",
            "violating_column": "score",
            "violating_value": "67",
            "rule_logic": "score greater than '90'",
            "comparison_value": "67",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Fred",
              "status": "inactive",
              "score": "67"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_32_Fred",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 31,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "33",
              "name": "Gina"
            },
            "details": "Column 'score' has value '75' violating R057",
            "violating_column": "score",
            "violating_value": "75",
            "rule_logic": "score greater than '90'",
            "comparison_value": "79",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Gina",
              "status": "active",
              "score": "75"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_33_Gina",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 33,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "35",
              "name": "Iris"
            },
            "details": "Column 'score' has value '81' violating R057",
            "violating_column": "score",
            "violating_value": "81",
            "rule_logic": "score greater than '90'",
            "comparison_value": "81",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Iris",
              "status": "inactive",
              "score": "81"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_35_Iris",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 34,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "36",
              "name": "Jacob"
            },
            "details": "Column 'score' has value '74' violating R057",
            "violating_column": "score",
            "violating_value": "74",
            "rule_logic": "score greater than '90'",
            "comparison_value": "74",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Jacob",
              "status": "active",
              "score": "74"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_36_Jacob",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 35,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "37",
              "name": "Kelly"
            },
            "details": "Column 'score' has value '89' violating R057",
            "violating_column": "score",
            "violating_value": "89",
            "rule_logic": "score greater than '90'",
            "comparison_value": "89",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Kelly",
              "status": "inactive",
              "score": "89"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_37_Kelly",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 36,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "38",
              "name": "Leo"
            },
            "details": "Column 'score' has value '82' violating R057",
            "violating_column": "score",
            "violating_value": "82",
            "rule_logic": "score greater than '90'",
            "comparison_value": "82",
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Leo",
              "status": "active",
              "score": "82"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_38_Leo",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 37,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "41",
              "name": "Oliver"
            },
            "details": "Column 'score' has value '84' violating R057",
            "violating_column": "score",
            "violating_value": "84",
            "rule_logic": "score greater than '90'",
            "comparison_value": null,
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "East"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Oliver",
              "status": "active",
              "score": "84"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_41_Oliver",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 38,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "42",
              "name": "Patricia"
            },
            "details": "Column 'score' has value '77' violating R057",
            "violating_column": "score",
            "violating_value": "77",
            "rule_logic": "score greater than '90'",
            "comparison_value": null,
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Patricia",
              "status": "inactive",
              "score": "77"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_42_Patricia",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 39,
            "rule_id": "R057",
            "rule_name": "Low Score",
            "key_columns": {
              "id": "43",
              "name": "Quincy"
            },
            "details": "Column 'score' has value '80' violating R057",
            "violating_column": "score",
            "violating_value": "80",
            "rule_logic": "score greater than '90'",
            "comparison_value": null,
            "extra_values": {},
            "grouping_values": {
              "status": "active",
              "region": "South"
            },
            "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
            "detail_values": {
              "name": "Quincy",
              "status": "active",
              "score": "80"
            },
            "exception_id": "CBR1_1FX1EVJ3Z8M6QRNGGZVR_43_Quincy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          }
        ],
        "R056": [
          {
            "row_index": 1,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "2",
              "name": "Bob"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "active",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Bob",
              "status": "inactive",
              "score": "78"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_2_Bob",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 2,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "3",
              "name": "Carol"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Carol",
              "status": "inactive",
              "score": "92"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_3_Carol",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 5,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "6",
              "name": "Frank"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Frank",
              "status": "inactive",
              "score": "88"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_6_Frank",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 8,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "9",
              "name": "Ivy"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Ivy",
              "status": "inactive",
              "score": "70"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_9_Ivy",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 11,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "12",
              "name": "Liam"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Liam",
              "status": "inactive",
              "score": "83"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_12_Liam",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 12,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "13",
              "name": "Mia"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "active",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Mia",
              "status": "inactive",
              "score": "91"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_13_Mia",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 16,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "17",
              "name": "Quinn"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Quinn",
              "status": "inactive",
              "score": "94"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_17_Quinn",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 18,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "19",
              "name": "Sam"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Sam",
              "status": "inactive",
              "score": "82"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_19_Sam",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 23,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "24",
              "name": "Xavier"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Xavier",
              "status": "inactive",
              "score": "84"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_24_Xavier",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 25,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "26",
              "name": "Zach"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Zach",
              "status": "inactive",
              "score": "71"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_26_Zach",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 27,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "28",
              "name": "Brad"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Brad",
              "status": "inactive",
              "score": "93"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_28_Brad",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 30,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "32",
              "name": "Fred"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Fred",
              "status": "inactive",
              "score": "67"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_32_Fred",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 32,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "34",
              "name": "Harry"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "South"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Harry",
              "status": "inactive",
              "score": "92"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_34_Harry",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 33,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "35",
              "name": "Iris"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "active",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "East"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Iris",
              "status": "inactive",
              "score": "81"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_35_Iris",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 35,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "37",
              "name": "Kelly"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": "inactive",
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "North"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Kelly",
              "status": "inactive",
              "score": "89"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_37_Kelly",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          },
          {
            "row_index": 38,
            "rule_id": "R056",
            "rule_name": "Valid status",
            "key_columns": {
              "id": "42",
              "name": "Patricia"
            },
            "details": "Column 'status' has value 'inactive' violating R056",
            "violating_column": "status",
            "violating_value": "inactive",
            "rule_logic": "status equals 'active'",
            "comparison_value": null,
            "extra_values": {},
            "grouping_values": {
              "status": "inactive",
              "region": "West"
            },
            "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T",
            "detail_values": {
              "name": "Patricia",
              "status": "inactive",
              "score": "77"
            },
            "exception_id": "CBR1_0Z100ERCHKBF4R1AGQ5T_42_Patricia",
            "exception_status": "New",
            "outcome_columns": [],
            "outcome_values": {},
            "outcome_results": {}
          }
        ]
      },
      "violation_count_by_rule": {
        "R057": 32,
        "R056": 16
      },
      "violating_rows_by_rule": {
        "R057": 32,
        "R056": 16
      },
      "violating_attributes_by_rule": {
        "R057": 32,
        "R056": 16
      },
      "rule_summaries": {
        "R057": {
          "name": "Low Score",
          "description": "",
          "logic": "score greater than '90'",
          "condition": "",
          "condition_grouping": "",
          "hide_comparison": false,
          "rule_identifier": "CBR1_1FX1EVJ3Z8M6QRNGGZVR"
        },
        "R056": {
          "name": "Valid status",
          "description": "",
          "logic": "status equals 'active'",
          "condition": "",
          "condition_grouping": "",
          "hide_comparison": false,
          "rule_identifier": "CBR1_0Z100ERCHKBF4R1AGQ5T"
        }
      }
    },
    "rule_bindings": {
      "R057": "CBR1_1FX1EVJ3Z8M6QRNGGZVR",
      "R056": "CBR1_0Z100ERCHKBF4R1AGQ5T"
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
    "filters_applied": [],
    "filter_relation": null,
    "filter_grouping_tree": null,
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
      "score"
    ],
    "extra_column_display": {
      "overall_result_page": true,
      "overall_html_report": true,
      "overall_excel_report": true,
      "new_books_result_page": true,
      "new_books_html_report": true,
      "new_books_excel_report": true,
      "exception_tables": false
    },
    "group_statistics": {
      "overall": [
        {
          "column": "status",
          "unique_count": 39,
          "attribute_count": 142,
          "rows": [
            {
              "value": "Total",
              "unique_count": 39,
              "attribute_count": 142
            },
            {
              "value": "active",
              "unique_count": 23,
              "attribute_count": 78
            },
            {
              "value": "inactive",
              "unique_count": 16,
              "attribute_count": 64
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 39,
          "attribute_count": 142,
          "rows": [
            {
              "value": "Total",
              "unique_count": 39,
              "attribute_count": 142
            },
            {
              "value": "East",
              "unique_count": 9,
              "attribute_count": 35
            },
            {
              "value": "North",
              "unique_count": 9,
              "attribute_count": 27
            },
            {
              "value": "South",
              "unique_count": 11,
              "attribute_count": 42
            },
            {
              "value": "West",
              "unique_count": 10,
              "attribute_count": 38
            }
          ]
        }
      ],
      "attribute_changes": [
        {
          "column": "status",
          "unique_count": 38,
          "attribute_count": 94,
          "rows": [
            {
              "value": "Total",
              "unique_count": 38,
              "attribute_count": 94
            },
            {
              "value": "active",
              "unique_count": 22,
              "attribute_count": 57
            },
            {
              "value": "inactive",
              "unique_count": 16,
              "attribute_count": 37
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 38,
          "attribute_count": 94,
          "rows": [
            {
              "value": "Total",
              "unique_count": 38,
              "attribute_count": 94
            },
            {
              "value": "East",
              "unique_count": 9,
              "attribute_count": 24
            },
            {
              "value": "North",
              "unique_count": 9,
              "attribute_count": 18
            },
            {
              "value": "South",
              "unique_count": 11,
              "attribute_count": 29
            },
            {
              "value": "West",
              "unique_count": 9,
              "attribute_count": 23
            }
          ]
        }
      ],
      "validation_rules": {
        "R057": [
          {
            "column": "status",
            "unique_count": 32,
            "attribute_count": 32,
            "rows": [
              {
                "value": "Total",
                "unique_count": 32,
                "attribute_count": 32
              },
              {
                "value": "active",
                "unique_count": 21,
                "attribute_count": 21
              },
              {
                "value": "inactive",
                "unique_count": 11,
                "attribute_count": 11
              }
            ]
          },
          {
            "column": "region",
            "unique_count": 32,
            "attribute_count": 32,
            "rows": [
              {
                "value": "Total",
                "unique_count": 32,
                "attribute_count": 32
              },
              {
                "value": "East",
                "unique_count": 8,
                "attribute_count": 8
              },
              {
                "value": "North",
                "unique_count": 6,
                "attribute_count": 6
              },
              {
                "value": "South",
                "unique_count": 9,
                "attribute_count": 9
              },
              {
                "value": "West",
                "unique_count": 9,
                "attribute_count": 9
              }
            ]
          }
        ],
        "R056": [
          {
            "column": "status",
            "unique_count": 16,
            "attribute_count": 16,
            "rows": [
              {
                "value": "Total",
                "unique_count": 16,
                "attribute_count": 16
              },
              {
                "value": "inactive",
                "unique_count": 16,
                "attribute_count": 16
              }
            ]
          },
          {
            "column": "region",
            "unique_count": 16,
            "attribute_count": 16,
            "rows": [
              {
                "value": "Total",
                "unique_count": 16,
                "attribute_count": 16
              },
              {
                "value": "East",
                "unique_count": 3,
                "attribute_count": 3
              },
              {
                "value": "North",
                "unique_count": 3,
                "attribute_count": 3
              },
              {
                "value": "South",
                "unique_count": 4,
                "attribute_count": 4
              },
              {
                "value": "West",
                "unique_count": 6,
                "attribute_count": 6
              }
            ]
          }
        ]
      },
      "new_books": [
        {
          "column": "status",
          "unique_count": 3,
          "attribute_count": 3,
          "rows": [
            {
              "value": "Total",
              "unique_count": 3,
              "attribute_count": 3
            },
            {
              "value": "active",
              "unique_count": 2,
              "attribute_count": 2
            },
            {
              "value": "inactive",
              "unique_count": 1,
              "attribute_count": 1
            }
          ]
        },
        {
          "column": "region",
          "unique_count": 3,
          "attribute_count": 3,
          "rows": [
            {
              "value": "Total",
              "unique_count": 3,
              "attribute_count": 3
            },
            {
              "value": "East",
              "unique_count": 1,
              "attribute_count": 1
            },
            {
              "value": "South",
              "unique_count": 1,
              "attribute_count": 1
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
    "commentary_template_columns": [
      "name",
      "status",
      "score"
    ],
    "new_exceptions_only": true
  }
};
