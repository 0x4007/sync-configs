# `UbiquityOS Configurations Agent`

- Use Claude 3.5 Sonnet to modify `.ubiquity-os.config.yml` (and `.ubiquity-os.dev.config.yml` dynamically) using plain english!
- If you don't specify which repository to target it will automatically select the three Ubiquity organization configs: [@ubiquity](https://github.com/ubiquity), [@ubiquity-os](https://github.com/ubiquity-os), [@ubiquity-os-marketplace](https://github.com/ubiquity-os-marketplace)
- Environments supported:
   - Local CLI
   - GitHub Actions dispatcher
