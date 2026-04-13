# Orbit Mission Stability Wrapper (Wide Workspace)
$target = "matt_korwel_gmail_com@35.188.152.246"
$key = "$HOME\.ssh\google_compute_engine"
$container = "868b91f025f5"

# Using 140x40 - Clean, large workspace.
$inner = "export LANG=C.UTF-8; " +
         "export TERM=tmux-256color; " +
         "export FORCE_COLOR=1; " +
         "export GCLI_NO_PROGRESS=1; " +
         "tmux set-option -sg escape-time 0; " +
         "tmux set-option -g status off; " +
         "tmux set-option -g visual-bell off; " +
         "tmux set-window-option -g alternate-screen off; " +
         "stty cols 140 rows 40; " +
         "echo STABLE_WIDE_SHELL_ACTIVE; " +
         "/bin/bash"

$dockerCmd = "sudo docker exec -it $container tmux -u -f /dev/null new-session -s stable-wide `"$inner`""

ssh -t -i $key $target $dockerCmd
