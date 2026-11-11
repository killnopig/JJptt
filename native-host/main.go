// jjptt-host: Chrome native messaging host for the JJptt extension.
//
// Chrome starts one process per connection. The extension sends JSON
// messages framed with a 4-byte little-endian length:
//
//	{"type":"connect","host":"ptt.cc","port":22}
//	{"type":"send","data":"<base64>"}
//	{"type":"close"}
//
// and receives {"type":"connected"}, {"type":"data","data":"<base64>"},
// {"type":"error","message":"..."} and {"type":"closed"}.
// The browser runs telnet/SSH itself; this program only forwards bytes.
package main

import (
	"bufio"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"sync"
	"time"
)

const version = "1.0.0"

var allowedHosts = map[string]bool{"ptt.cc": true, "ptt2.cc": true}

// testAllowHost can be set at build time (-ldflags "-X main.testAllowHost=...")
// to point the host at a local test server. Release builds leave it empty.
var testAllowHost = ""

func allowedTarget(host string, port int) bool {
	if testAllowHost != "" && host == testAllowHost {
		return true
	}
	return allowedHosts[host] && allowedPort(port)
}

func allowedPort(p int) bool {
	return p == 22 || p == 23 || p == 443 || (p >= 3000 && p <= 3010)
}

type inMsg struct {
	Type string `json:"type"`
	Host string `json:"host"`
	Port int    `json:"port"`
	Data string `json:"data"`
}

type outMsg struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
	Version string `json:"version,omitempty"`
}

var outMu sync.Mutex

func send(m outMsg) {
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	outMu.Lock()
	defer outMu.Unlock()
	var hdr [4]byte
	binary.LittleEndian.PutUint32(hdr[:], uint32(len(b)))
	os.Stdout.Write(hdr[:])
	os.Stdout.Write(b)
}

func readMsg(r io.Reader) (*inMsg, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	n := binary.LittleEndian.Uint32(hdr[:])
	if n > 16*1024*1024 {
		return nil, errors.New("message too large")
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	var m inMsg
	if err := json.Unmarshal(buf, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Println("jjptt-host", version)
		return
	}

	in := bufio.NewReader(os.Stdin)
	var conn net.Conn

	for {
		m, err := readMsg(in)
		if err != nil {
			// Extension closed the port (or sent garbage): shut down.
			if conn != nil {
				conn.Close()
			}
			return
		}

		switch m.Type {
		case "connect":
			if conn != nil {
				continue
			}
			if !allowedTarget(m.Host, m.Port) {
				send(outMsg{Type: "error", Message: "target not allowed"})
				return
			}
			addr := net.JoinHostPort(m.Host, strconv.Itoa(m.Port))
			c, err := net.DialTimeout("tcp", addr, 15*time.Second)
			if err != nil {
				send(outMsg{Type: "error", Message: err.Error()})
				return
			}
			conn = c
			send(outMsg{Type: "connected", Version: version})
			go func(c net.Conn) {
				buf := make([]byte, 64*1024)
				for {
					n, err := c.Read(buf)
					if n > 0 {
						send(outMsg{Type: "data", Data: base64.StdEncoding.EncodeToString(buf[:n])})
					}
					if err != nil {
						send(outMsg{Type: "closed"})
						os.Exit(0)
					}
				}
			}(c)

		case "send":
			if conn == nil {
				continue
			}
			data, err := base64.StdEncoding.DecodeString(m.Data)
			if err != nil {
				continue
			}
			if _, err := conn.Write(data); err != nil {
				send(outMsg{Type: "closed"})
				return
			}

		case "close":
			if conn != nil {
				conn.Close()
			}
			return

		case "ping":
			send(outMsg{Type: "pong", Version: version})
		}
	}
}
